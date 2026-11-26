package com.horsecoder.common.whuTalent.core.flow.Run.structure;

import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * loop 节点的执行器：帧、终止条件、预算、状态、失败、checkpoint。
 *
 * <p>调用关系：{@link StructureExecutor#doLoop(JSONObject)} 每次遇到一个
 * {@code type=loop} 节点，就 {@code new LoopRunner(executor, node).run()}。
 * 一个 LoopRunner 实例只服务一次循环执行，不跨请求复用。</p>
 *
 * <p>三个核心对象：</p>
 * <ul>
 *   <li>{@code frame}：暴露给 body 的当前循环信息，变量名固定为 {@code loop}，
 *       形如 {@code {index, count, current, state}}；</li>
 *   <li>{@code state}：跨轮保留的可变状态，body 里的 collect / compute accumulate
 *       都写到这里，最后随 summary 一起返回；</li>
 *   <li>{@code summary}：循环总账，结束时注册为 {@code vars["loop_" + loopId]}，
 *       所以 id 为 {@code loop1} 时变量名是 {@code loop_loop1}。</li>
 * </ul>
 *
 * <p>结束状态：</p>
 * <ul>
 *   <li>{@code DONE}：forEach 集合耗尽，或 while 条件为 false（正常）；</li>
 *   <li>{@code BROKEN}：命中 {@code breakWhen}（正常提前结束）；</li>
 *   <li>{@code EXHAUSTED}：达到 {@code maxIterations}（异常）；</li>
 *   <li>{@code TIMEOUT}：超过 {@code budget.wallClockMs}（异常）；</li>
 *   <li>{@code FAILED}：{@code onError=abort} 或失败轮数达到
 *       {@code budget.maxFailures}（异常）。</li>
 * </ul>
 * 异常状态默认让整个结构 {@code ERROR}；节点声明 {@code allowPartial: true}
 * 时改为在 summary 里标记 {@code partial: true} 并继续返回。
 *
 * <p>语义设计见 {@code loop-structures/docs/01-loop-design.md}；
 * 实测用例见 {@code loop-structures/docs/11-loop-tests.md}。</p>
 */
final class LoopRunner {

    /**
     * 任何循环的硬上限，防止结构写错（例如 while 条件永远为真）导致进程跑飞。
     * 即使结构里写了更大的 maxIterations，也会被压到 300。
     */
    private static final int HARD_CAP = 300;

    /** 外层结构解释器，用来执行 body 和读写全局变量表。 */
    private final StructureExecutor executor;

    /** 当前 loop 节点的原始 JSON，所有配置都从这里读。 */
    private final JSONObject node;

    /** 解释器的全局变量表；body 节点与普通节点共用同一张表。 */
    private final Map<String, Object> vars;

    LoopRunner(StructureExecutor executor, JSONObject node) {
        this.executor = executor;
        this.node = node;
        this.vars = executor.vars();
    }

    /**
     * 执行一次完整的循环。
     *
     * <p>执行顺序固定为：读配置 → 建 frame/state/summary → 保存外层变量 →
     * 逐轮执行 → 恢复外层变量 → 写 summary → 按状态决定是否抛错。</p>
     */
    void run() throws Exception {
        // ------------------------------------------------------------------
        // 1. 读取循环配置
        // ------------------------------------------------------------------
        String loopId = node.getString("id");
        String mode = node.getString("mode") == null ? "forEach" : node.getString("mode");
        JSONArray body = node.getJSONArray("body");
        if (body == null || body.isEmpty()) throw new IllegalArgumentException("循环 " + loopId + " 没有 body");

        // forEach：先求值 items，得到要遍历的数组。
        // while：不看 items，只保留一个空列表用于 count=0；每轮是否继续由 condition 决定。
        List<Object> items = "forEach".equals(mode)
                ? NodeSupport.toList(Expr.eval(node.getString("items"), vars))
                : new ArrayList<Object>();

        // 最大轮数：结构显式配置优先；否则 forEach 默认 max(50, 集合大小)，
        // while 默认 10；最后统一受 HARD_CAP=300 限制。
        int max = maxIterations(mode, items.size());

        // 当前项、当前下标、失败策略。itemVar/indexVar 默认为 item/i，
        // body 里的模板用 {{item.xxx}} / {{i}} 取它们。
        String itemVar = node.getString("itemVar") == null ? "item" : node.getString("itemVar");
        String indexVar = node.getString("indexVar") == null ? "i" : node.getString("indexVar");
        String onError = node.getString("onError") == null ? "continue" : node.getString("onError");

        // ------------------------------------------------------------------
        // 2. 建 state / budget / checkpoint / summary / frame
        // ------------------------------------------------------------------
        // state 在循环开始前从节点的 state 字段复制一份；整个循环共用同一个对象，
        // 因此 body 里的 collect、compute accumulate 写进去的值会跨轮保留。
        JSONObject state = new JSONObject(true);
        if (node.getJSONObject("state") != null) state.putAll(node.getJSONObject("state"));

        // 预算是可选的：0 表示不限制。
        JSONObject budget = node.getJSONObject("budget");
        long wallClockMs = budget == null ? 0 : budget.getLongValue("wallClockMs");
        int maxFailures = budget == null ? 0 : budget.getIntValue("maxFailures");
        long loopStartedAt = System.currentTimeMillis();

        // checkpoint 也是可选的：every 表示每几轮记一次，keep 表示内存里保留几条，
        // file 表示是否额外追加到 JSONL 文件。
        JSONObject checkpointConfig = node.getJSONObject("checkpoint");
        int checkpointEvery = checkpointConfig == null ? 0 : Math.max(1, checkpointConfig.getIntValue("every"));
        int checkpointKeep = checkpointConfig == null ? 0 : Math.max(1, checkpointConfig.getIntValue("keep"));
        String checkpointFile = checkpointConfig == null ? null : checkpointConfig.getString("file");

        // summary 是循环的总账：state/failures/perIteration/checkpoints 都是引用，
        // 后续往这些数组里 add 的内容会直接出现在 summary 里。
        JSONObject summary = new JSONObject(true);
        JSONArray failures = new JSONArray();
        JSONArray perIteration = new JSONArray();
        JSONArray checkpoints = new JSONArray();
        summary.put("id", loopId);
        summary.put("mode", mode);
        summary.put("state", state);
        summary.put("failures", failures);
        summary.put("perIteration", perIteration);
        if (checkpointEvery > 0) summary.put("checkpoints", checkpoints);

        // frame 通过 vars["loop"] 暴露给 body。index/count 是只读语义，
        // state 是可变引用；body 里可以写 {{loop.index}}、{{loop.state.xxx}}。
        Map<String, Object> frame = new LinkedHashMap<>();
        frame.put("index", 0);
        frame.put("count", items.size());
        frame.put("state", state);

        // 支持嵌套循环：进入前保存外层可能同名的 loop/item/index 变量，
        // 循环结束后（包括异常）在 finally 里恢复，避免内层覆盖外层。
        Object previousLoop = vars.get("loop");
        Object previousItem = vars.get(itemVar);
        Object previousIndex = vars.get(indexVar);
        vars.put("loop", frame);

        // ------------------------------------------------------------------
        // 3. 主循环
        // ------------------------------------------------------------------
        String status = "DONE";
        int index = 0;
        int succeeded = 0;
        int failed = 0;
        int skipped = 0;
        executor.enterLoop(); // 嵌套深度检查（最多 2 层）
        try {
            while (true) {
                // 3.1 把当前进度同步到 frame 和下标变量，保证 body/条件能读到最新 index。
                frame.put("index", index);
                vars.put(indexVar, index);

                // 3.2 判断“还有没有下一项”：
                //     forEach 看集合是否耗尽；while 看 condition 是否为 false。
                if ("forEach".equals(mode)) {
                    if (index >= items.size()) break;
                } else if (!Expr.evalBool(node.getString("condition"), vars)) {
                    break;
                }

                // 3.3 最大轮数限制。注意先判断集合/条件，再判断 max：
                //     这样 maxIterations=0 时也能保证至少检查一次。
                if (index >= max) {
                    status = "EXHAUSTED";
                    break;
                }

                // 3.4 墙钟预算：从循环开始算起，超时立即停。
                if (wallClockMs > 0 && System.currentTimeMillis() - loopStartedAt > wallClockMs) {
                    status = "TIMEOUT";
                    break;
                }

                // 3.5 forEach 把当前项放进 itemVar；while 没有集合，itemVar 保持上一次的值。
                if ("forEach".equals(mode)) {
                    vars.put(itemVar, items.get(index));
                }
                vars.put(indexVar, index);
                frame.put("index", index);
                frame.put("current", vars.get(itemVar));

                // 3.6 breakWhen：在 body 之前判断，含义是“当前这一项不要开始做”。
                if (node.getString("breakWhen") != null && Expr.evalBool(node.getString("breakWhen"), vars)) {
                    status = "BROKEN";
                    break;
                }

                // 3.7 continueWhen：跳过当前项，不执行 body，也不写 perIteration；
                //     skipped 只统计这种主动跳过，不统计 body 内部的过滤。
                if (node.getString("continueWhen") != null && Expr.evalBool(node.getString("continueWhen"), vars)) {
                    skipped++;
                    index++;
                    continue;
                }

                // 3.8 执行 body。异常在这里被消化成“本轮失败”，
                //     是否继续由 onError / maxFailures 决定。
                long started = System.currentTimeMillis();
                JSONObject iteration = new JSONObject(true);
                iteration.put("i", index);
                iteration.put("item", NodeSupport.itemId(vars.get(itemVar)));
                try {
                    runBodyWithRetry(body, onError);
                    succeeded++;
                    iteration.put("status", "ok");
                } catch (Exception e) {
                    failed++;
                    iteration.put("status", "failed");
                    iteration.put("error", e.getMessage() == null ? e.toString() : e.getMessage());
                    JSONObject failure = new JSONObject(true);
                    failure.put("index", index);
                    failure.put("item", NodeSupport.itemId(vars.get(itemVar)));
                    failure.put("error", e.getMessage() == null ? e.toString() : e.getMessage());
                    failures.add(failure);

                    // abort：本轮失败立即整体停；
                    // maxFailures>0 且累计失败达到阈值：也整体停。
                    // 其他情况（默认 continue / retry 用尽）：记录后进入下一轮。
                    if ("abort".equals(onError) || (maxFailures > 0 && failed >= maxFailures)) {
                        status = "FAILED";
                        iteration.put("ms", System.currentTimeMillis() - started);
                        perIteration.add(iteration);
                        break;
                    }
                }
                iteration.put("ms", System.currentTimeMillis() - started);
                perIteration.add(iteration);

                // 3.9 checkpoint：每 every 轮记一条 {i,item,status}。
                //     内存里只保留最近 keep 条（环形缓冲），file 则只追加不删。
                //     注意 index=0 也会记录，所以 every=1 时第一轮就有 checkpoint。
                if (checkpointEvery > 0 && index % checkpointEvery == 0) {
                    JSONObject checkpoint = new JSONObject(true);
                    checkpoint.put("i", index);
                    checkpoint.put("item", iteration.get("item"));
                    checkpoint.put("status", iteration.get("status"));
                    checkpoints.add(checkpoint);
                    while (checkpoints.size() > checkpointKeep) checkpoints.remove(0);
                    NodeSupport.appendCheckpoint(checkpointFile, loopId, checkpoint);
                }

                index++;
            }
        } finally {
            // 无论正常结束还是抛异常，都要退出嵌套计数并恢复外层变量。
            // 如果外层原本没有这个变量（previous 为 null），就直接 remove，
            // 避免把内层的 item/index 泄漏到循环外。
            executor.exitLoop();
            vars.put("loop", previousLoop);
            if (previousItem == null) vars.remove(itemVar); else vars.put(itemVar, previousItem);
            if (previousIndex == null) vars.remove(indexVar); else vars.put(indexVar, previousIndex);
        }

        // ------------------------------------------------------------------
        // 4. 写 summary 并按状态决定是否让整个结构失败
        // ------------------------------------------------------------------
        summary.put("status", status);
        summary.put("iterations", index); // 已推进的轮数；breakWhen 在 body 前触发时不计入
        summary.put("succeeded", succeeded);
        summary.put("failed", failed);
        summary.put("skipped", skipped);

        // 注册为 loop_<id>。例如循环节点 id=loop1，body 之后可用 {{loop_loop1.state.xxx}}。
        executor.registerLoopSummary(loopId, summary);

        // EXHAUSTED / TIMEOUT / FAILED 属于异常结束；BROKEN 是主动提前结束，不算异常。
        boolean abnormal = "EXHAUSTED".equals(status) || "FAILED".equals(status) || "TIMEOUT".equals(status);
        if (abnormal && !node.getBooleanValue("allowPartial")) {
            // 默认行为：让整个结构 ERROR，失败可见。
            throw new IllegalStateException("循环 " + loopId + " 异常结束: " + status);
        }
        if (abnormal) summary.put("partial", true);
    }

    /**
     * 执行一轮 body，并按 onError 决定是否重试。
     *
     * <p>注意：retry 重跑的是<b>整个 body</b>，不是单个节点。如果 body 里已经有
     * 建 case、发邮件这类非幂等副作用，重试可能导致重复执行。安全做法是让
     * 写操作之前先 assert / 校验，或者只对可重复执行的动作使用 retry。</p>
     */
    private void runBodyWithRetry(JSONArray body, String onError) throws Exception {
        int maxAttempts = "retry".equals(onError) ? Math.max(1, node.getIntValue("maxAttempts")) : 1;
        Exception last = null;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                executor.executeBody(body);
                return;
            } catch (Exception e) {
                last = e;
            }
        }
        if (last != null) throw last;
    }

    /**
     * 计算最大轮数。
     *
     * <p>显式 maxIterations 优先；否则 forEach 默认 max(50, 集合大小)，
     * while 默认 10；最后统一不超过 HARD_CAP。</p>
     */
    private int maxIterations(String mode, int size) {
        Integer explicit = node.getInteger("maxIterations");
        int max;
        if (explicit != null) {
            max = explicit;
        } else if ("forEach".equals(mode)) {
            max = Math.max(50, size);
        } else {
            max = 10;
        }
        return Math.min(max, HARD_CAP);
    }
}
