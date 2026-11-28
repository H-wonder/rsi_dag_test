package com.horsecoder.common.whuTalent.core.flow.Run.structure;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 结构解释器：执行画布导出的结构 JSON。
 *
 * 当前支持：sequence / fetch / action / loop / assert / filter / map / aggregate / branch。
 * 循环语义见 loop-structures/docs/01-loop-design.md。
 */
public class StructureExecutor {

    static final int MAX_LOOP_DEPTH = 2;
    private static final int MAX_CHAIN_STEPS = 500;

    private final JSONObject root;
    private final JSONObject meta;
    private final Map<String, JSONObject> nodes = new LinkedHashMap<>();
    private final JSONArray edges;
    private final Map<String, Object> vars = new HashMap<>();
    private final Map<String, JSONObject> loopSummaries = new LinkedHashMap<>();
    private final BridgeClient bridge;
    private final ModelClient model;

    private int loopDepth = 0;
    private int llmCalls = 0;

    public StructureExecutor(String structureJson) {
        this(JSON.parseObject(structureJson));
    }

    public StructureExecutor(JSONObject root) {
        this.root = root;
        this.meta = root.getJSONObject("meta");
        this.edges = root.getJSONArray("edges") == null ? new JSONArray() : root.getJSONArray("edges");
        JSONArray nodeArray = root.getJSONArray("nodes");
        if (nodeArray == null || nodeArray.isEmpty()) {
            throw new IllegalArgumentException("structure.nodes 不能为空");
        }
        for (int i = 0; i < nodeArray.size(); i++) {
            JSONObject node = nodeArray.getJSONObject(i);
            nodes.put(node.getString("id"), node);
        }
        String bridgeUrl = meta == null ? null : meta.getString("bridge");
        if (bridgeUrl == null || bridgeUrl.trim().isEmpty()) bridgeUrl = System.getProperty("bridge.url");
        if (bridgeUrl == null || bridgeUrl.trim().isEmpty()) bridgeUrl = System.getenv("BRIDGE_URL");
        this.bridge = new BridgeClient(bridgeUrl);
        this.model = new ModelClient();
        validateStructure();
    }

    /**
     * 结构级校验：循环嵌套最多两层，body 引用的节点必须存在。
     */
    private void validateStructure() {
        for (String id : nodes.keySet()) {
            validateNode(nodes.get(id), 0);
        }
    }

    private void validateNode(JSONObject node, int loopDepth) {
        String type = node.getString("type");
        if (type == null) type = "sequence";
        int childDepth = loopDepth;
        if ("loop".equals(type)) {
            childDepth = loopDepth + 1;
            if (childDepth > MAX_LOOP_DEPTH) {
                throw new IllegalArgumentException("循环嵌套超过 " + MAX_LOOP_DEPTH + " 层: " + node.getString("id"));
            }
        }
        validateBody(node.getJSONArray("body"), childDepth);
        if ("branch".equals(type)) {
            JSONArray cases = node.getJSONArray("cases");
            if (cases != null) {
                for (int i = 0; i < cases.size(); i++) {
                    validateBody(cases.getJSONObject(i).getJSONArray("body"), childDepth);
                }
            }
            validateBody(node.getJSONArray("default"), childDepth);
        }
    }

    private void validateBody(JSONArray body, int depth) {
        if (body == null) return;
        for (int i = 0; i < body.size(); i++) {
            String id = body.getString(i);
            JSONObject child = nodes.get(id);
            if (child == null) throw new IllegalArgumentException("body 引用了不存在的节点: " + id);
            validateNode(child, depth);
        }
    }

    public JSONObject run() {
        JSONObject result = new JSONObject(true);
        result.put("task", meta == null ? null : meta.getString("task"));
        result.put("bridge", bridge.baseUrl());
        try {
            if (meta != null && meta.getJSONObject("vars") != null) {
                vars.putAll(meta.getJSONObject("vars"));
            }
            vars.put("meta", meta == null ? new JSONObject() : meta);

            String current = startNode();
            int steps = 0;
            while (current != null && !"end".equals(current)) {
                if (++steps > MAX_CHAIN_STEPS) {
                    throw new IllegalStateException("节点链超过 " + MAX_CHAIN_STEPS + " 步，疑似环路");
                }
                JSONObject node = nodes.get(current);
                if (node == null) throw new IllegalStateException("节点不存在: " + current);
                executeNode(node);
                current = nextNode(current);
            }
            result.put("status", "OK");
        } catch (Exception e) {
            result.put("status", "ERROR");
            result.put("error", e.getMessage() == null ? e.toString() : e.getMessage());
        }
        result.put("loops", loopSummaries);
        result.put("llmCalls", llmCalls);
        result.put("outputs", exposedVars());
        return result;
    }

    public Map<String, Object> vars() {
        return vars;
    }

    // ------------------------------------------------------------------
    // 节点执行
    // ------------------------------------------------------------------

    private void executeNode(JSONObject node) throws Exception {
        String type = node.getString("type");
        if (type == null) type = "sequence";
        switch (type) {
            case "sequence":
                executeBody(node.getJSONArray("body"));
                break;
            case "fetch":
            case "action":
                doTool(node);
                break;
            case "loop":
                doLoop(node);
                break;
            case "assert":
                doAssert(node);
                break;
            case "rows":
                doRows(node);
                break;
            case "encode":
                doEncode(node);
                break;
            case "compute":
                doCompute(node);
                break;
            case "businessdays":
                doBusinessDays(node);
                break;
            case "datediff":
                doDateDiff(node);
                break;
            case "first":
                doFirst(node);
                break;
            case "join":
                doJoin(node);
                break;
            case "collect":
                doCollect(node);
                break;
            case "filter":
                doFilter(node);
                break;
            case "map":
                doMap(node);
                break;
            case "aggregate":
                doAggregate(node);
                break;
            case "branch":
                doBranch(node);
                break;
            case "extract":
                doExtract(node);
                break;
            default:
                throw new IllegalArgumentException("不支持的节点类型: " + type);
        }
    }

    private void doTool(JSONObject node) throws Exception {
        String skillFlow = node.getString("skillFlow");
        if (skillFlow != null && !skillFlow.isEmpty()) {
            Object rendered = Expr.render(node.getJSONObject("args"), vars);
            JSONObject args = rendered instanceof JSONObject ? (JSONObject) rendered : new JSONObject();
            Object params = args.get("params");
            Object body = args.get("body");
            Object value = cc.eamon.open.flow.core.FlowEngine.instance()
                    .register("method", args.getString("method") == null ? "GET" : args.getString("method"))
                    .register("url", args.getString("url"))
                    .register("paramsJson", params == null ? null : JSON.toJSONString(params))
                    .register("bodyJson", body == null ? null : JSON.toJSONString(body))
                    .run(skillFlow)
                    .retrieve("result");
            if (value instanceof String) {
                String text = ((String) value).trim();
                if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
                    try {
                        value = JSON.parse(text);
                    } catch (Exception ignore) {
                        // keep string
                    }
                }
            }
            String out = node.getString("out");
            if (out != null && !out.isEmpty()) vars.put(out, value);
            return;
        }
        String tool = node.getString("tool");
        if (tool == null) tool = node.getString("action");
        if (tool == null) throw new IllegalArgumentException("节点 " + node.getString("id") + " 缺少 tool/action");
        Object rendered = Expr.render(node.getJSONObject("args"), vars);
        Map<String, Object> args = rendered instanceof JSONObject
                ? (JSONObject) rendered
                : new HashMap<String, Object>();
        Object value = bridge.call(tool, args);
        String out = node.getString("out");
        if (out != null && !out.isEmpty()) vars.put(out, value);
    }

    private void doAssert(JSONObject node) {
        if (!Expr.evalBool(node.getString("expr"), vars)) {
            String message = node.getString("message");
            throw new IllegalStateException(message == null ? "assert 失败: " + node.getString("expr") : message);
        }
    }

    /**
     * Sheets values（首行表头 + 数据行）转对象数组。
     */
    private void doRows(JSONObject node) {
        List<Object> values = NodeSupport.toList(Expr.eval(node.getString("items"), vars));
        JSONArray out = new JSONArray();
        if (!values.isEmpty()) {
            List<Object> header = NodeSupport.toList(values.get(0));
            for (int r = 1; r < values.size(); r++) {
                List<Object> row = NodeSupport.toList(values.get(r));
                JSONObject obj = new JSONObject(true);
                for (int c = 0; c < header.size(); c++) {
                    String key = String.valueOf(header.get(c)).trim();
                    Object value = c < row.size() ? row.get(c) : "";
                    obj.put(key, value);
                    obj.put(key.replaceAll("[^A-Za-z0-9]+", "_").replaceAll("_+", "_"), value);
                }
                obj.put("_row", r + 1);
                out.add(obj);
            }
        }
        vars.put(node.getString("out"), out);
    }

    /**
     * base64url 编码（Gmail payload.body.data 需要）。
     */
    private void doEncode(JSONObject node) throws Exception {
        Object rendered = Expr.render(node.get("value"), vars);
        Map<String, Object> args = new HashMap<>();
        args.put("text", rendered == null ? "" : String.valueOf(rendered));
        vars.put(node.getString("out"), bridge.call("base64_encode", args));
    }

    /**
     * 数值计算：left/right 渲染后转数字，按 op 计算，按 format 格式化。
     * 可选 accumulate：累加到当前循环帧的 state，并把总数写到 totalOut。
     */
    private void doCompute(JSONObject node) {
        double left = NodeSupport.parseDouble(Expr.render(node.get("left"), vars));
        double right = NodeSupport.parseDouble(Expr.render(node.get("right"), vars));
        String op = node.getString("op");
        double value;
        switch (op) {
            case "add":
                value = left + right;
                break;
            case "subtract":
                value = left - right;
                break;
            case "multiply":
                value = left * right;
                break;
            case "divide":
                value = right == 0 ? 0 : left / right;
                break;
            default:
                throw new IllegalArgumentException("不支持的运算: " + op);
        }
        String out = node.getString("out");
        if (out != null) vars.put(out, NodeSupport.format(value, node.getString("format")));

        String accumulate = node.getString("accumulate");
        if (accumulate != null) {
            Object loop = vars.get("loop");
            if (loop instanceof Map) {
                Object stateObj = ((Map<?, ?>) loop).get("state");
                if (stateObj instanceof JSONObject) {
                    JSONObject state = (JSONObject) stateObj;
                    double total = NodeSupport.parseDouble(state.get(accumulate)) + value;
                    state.put(accumulate, total);
                    String totalOut = node.getString("totalOut");
                    if (totalOut != null) {
                        String totalFormat = node.getString("totalFormat");
                        vars.put(totalOut, NodeSupport.format(total, totalFormat == null ? node.getString("format") : totalFormat));
                    }
                }
            }
        }
    }

    /**
     * 取数组第一个元素（消融/顺序结构用）。
     */
    private void doFirst(JSONObject node) {
        List<Object> items = NodeSupport.toList(Expr.eval(node.getString("items"), vars));
        if (items.isEmpty()) {
            vars.put(node.getString("out"), null);
            return;
        }
        Object first = items.get(0);
        vars.put(node.getString("out"), first);
        String itemVar = node.getString("itemVar");
        if (itemVar != null) vars.put(itemVar, first);
    }

    /**
     * to - from 的自然日差（正数表示未来）。
     */
    private void doDateDiff(JSONObject node) {
        String from = String.valueOf(Expr.render(node.get("from"), vars));
        String to = String.valueOf(Expr.render(node.get("to"), vars));
        long days = 0;
        try {
            java.time.LocalDate start = java.time.LocalDate.parse(from.substring(0, 10));
            java.time.LocalDate end = java.time.LocalDate.parse(to.substring(0, 10));
            days = java.time.temporal.ChronoUnit.DAYS.between(start, end);
        } catch (Exception ignore) {
            days = 0;
        }
        vars.put(node.getString("out"), days);
    }

    /**
     * 计算 from 之后到 to（含）之间的工作日数量，排除周六周日。
     */
    private void doBusinessDays(JSONObject node) {
        String from = String.valueOf(Expr.render(node.get("from"), vars));
        String to = String.valueOf(Expr.render(node.get("to"), vars));
        int days = 0;
        try {
            java.time.LocalDate start = java.time.LocalDate.parse(from.substring(0, 10));
            java.time.LocalDate end = java.time.LocalDate.parse(to.substring(0, 10));
            for (java.time.LocalDate d = start.plusDays(1); !d.isAfter(end); d = d.plusDays(1)) {
                if (d.getDayOfWeek() != java.time.DayOfWeek.SATURDAY
                        && d.getDayOfWeek() != java.time.DayOfWeek.SUNDAY) {
                    days++;
                }
            }
        } catch (Exception e) {
            days = 0;
        }
        vars.put(node.getString("out"), days);
    }

    /**
     * 左表按 key 关联右表，复制字段；可选 setFound 标记是否匹配。
     */
    private void doJoin(JSONObject node) {
        List<Object> items = NodeSupport.toList(Expr.eval(node.getString("items"), vars));
        List<Object> others = NodeSupport.toList(Expr.eval(node.getString("with"), vars));
        String leftKey = node.getString("leftKey");
        String rightKey = node.getString("rightKey");
        JSONObject fields = node.getJSONObject("fields");
        String setFound = node.getString("setFound");
        for (Object item : items) {
            if (!(item instanceof JSONObject)) continue;
            JSONObject left = (JSONObject) item;
            JSONObject found = null;
            for (Object other : others) {
                if (other instanceof JSONObject
                        && String.valueOf(((JSONObject) other).get(rightKey))
                        .equals(String.valueOf(left.get(leftKey)))) {
                    found = (JSONObject) other;
                    break;
                }
            }
            if (found != null && fields != null) {
                for (String key : fields.keySet()) {
                    left.put(key, found.get(fields.getString(key)));
                }
            }
            if (setFound != null) left.put(setFound, found != null);
        }
        vars.put(node.getString("out"), items);
    }

    /**
     * 把渲染后的文本追加到当前循环帧 state 的某个键（用换行分隔）。
     */
    private void doCollect(JSONObject node) {
        Object loop = vars.get("loop");
        if (!(loop instanceof Map)) return;
        Object stateObj = ((Map<?, ?>) loop).get("state");
        if (!(stateObj instanceof JSONObject)) return;
        JSONObject state = (JSONObject) stateObj;
        String key = node.getString("stateKey");
        Object rendered = Expr.render(node.get("value"), vars);
        if ("array".equals(node.getString("as"))) {
            JSONArray items = state.getJSONArray(key);
            if (items == null) {
                items = new JSONArray();
                state.put(key, items);
            }
            items.add(rendered);
            return;
        }
        String value = rendered == null ? "" : String.valueOf(rendered);
        Object previous = state.get(key);
        state.put(key, previous == null ? value : previous + "\n" + value);
    }

    /**
     * 语义抽取：调用模型把自由文本转成 JSON，带字段校验与可选重试（P4）。
     *
     * 节点字段：prompt / system / schema / model / temperature / maxTokens /
     * reasoningEffort / out / required / validate / retries。
     */
    private void doExtract(JSONObject node) throws Exception {
        int attempts = Math.max(1, node.getIntValue("retries") + 1);
        String out = node.getString("out");
        if (out == null || out.isEmpty()) {
            throw new IllegalArgumentException("extract 节点需要 out: " + node.getString("id"));
        }
        String lastError = null;
        for (int attempt = 1; attempt <= attempts; attempt++) {
            String prompt = String.valueOf(Expr.render(node.getString("prompt"), vars));
            if (lastError != null) {
                prompt += "\n\n上一次输出无效：" + lastError
                        + "\n请只返回修正后的 JSON 对象，不要解释。";
            }
            JSONObject schema = node.getJSONObject("schema");
            if (schema != null) {
                Object renderedSchema = Expr.render(schema, vars);
                prompt += "\n\nJSON schema:\n" + JSON.toJSONString(renderedSchema);
            }
            String system = node.getString("system");
            if (system == null || system.trim().isEmpty()) {
                system = "You are a precise information extraction engine. "
                        + "Return only one JSON object, no markdown, no commentary.";
            } else {
                system = String.valueOf(Expr.render(system, vars));
            }
            String content = model.complete(
                    system,
                    prompt,
                    node.getString("model"),
                    node.getDouble("temperature"),
                    node.getInteger("maxTokens"),
                    node.getString("reasoningEffort"));
            llmCalls++;

            JSONObject parsed = parseJsonObject(content);
            if (parsed == null) {
                lastError = "返回内容不是 JSON 对象";
                continue;
            }
            JSONArray required = node.getJSONArray("required");
            String missing = null;
            if (required != null) {
                for (int i = 0; i < required.size(); i++) {
                    String key = required.getString(i);
                    Object value = parsed.get(key);
                    if (value == null || String.valueOf(value).trim().isEmpty()) {
                        missing = key;
                        break;
                    }
                }
            }
            if (missing != null) {
                lastError = "缺少字段 " + missing;
                continue;
            }
            String validate = node.getString("validate");
            if (validate != null && !validate.trim().isEmpty()) {
                Map<String, Object> context = new HashMap<>(vars);
                for (String key : parsed.keySet()) context.put(key, parsed.get(key));
                if (!Expr.evalBool(validate, context)) {
                    lastError = "未通过校验表达式: " + validate;
                    continue;
                }
            }
            vars.put(out, parsed);
            return;
        }
        throw new IllegalStateException("extract 失败（" + attempts + " 次）: " + lastError);
    }

    private JSONObject parseJsonObject(String content) {
        if (content == null) return null;
        String text = content.trim();
        if (text.startsWith("```")) {
            int firstNewline = text.indexOf('\n');
            int lastFence = text.lastIndexOf("```");
            if (firstNewline >= 0 && lastFence > firstNewline) {
                text = text.substring(firstNewline + 1, lastFence).trim();
            }
        }
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
            return JSON.parseObject(text.substring(start, end + 1));
        } catch (Exception e) {
            return null;
        }
    }

    private void doFilter(JSONObject node) {
        List<Object> items = NodeSupport.toList(Expr.eval(node.getString("items"), vars));
        JSONArray out = new JSONArray();
        for (Object item : items) {
            Map<String, Object> saved = NodeSupport.bindItem(vars, item);
            if (Expr.evalBool(node.getString("when"), vars)) out.add(item);
            NodeSupport.restoreItem(vars, saved);
        }
        vars.put(node.getString("out"), out);
    }

    private void doMap(JSONObject node) {
        List<Object> items = NodeSupport.toList(Expr.eval(node.getString("items"), vars));
        JSONObject fields = node.getJSONObject("fields");
        JSONArray out = new JSONArray();
        for (Object item : items) {
            Map<String, Object> saved = NodeSupport.bindItem(vars, item);
            if (fields == null) {
                out.add(item);
            } else {
                out.add(Expr.render(fields, vars));
            }
            NodeSupport.restoreItem(vars, saved);
        }
        vars.put(node.getString("out"), out);
    }

    private void doAggregate(JSONObject node) {
        List<Object> items = NodeSupport.toList(Expr.eval(node.getString("items"), vars));
        String op = node.getString("op");
        String field = node.getString("field");
        if ("count".equals(op)) {
            vars.put(node.getString("out"), items.size());
            return;
        }
        double sum = 0;
        double min = Double.POSITIVE_INFINITY;
        double max = Double.NEGATIVE_INFINITY;
        JSONObject groups = new JSONObject(true);
        for (Object item : items) {
            Map<String, Object> saved = NodeSupport.bindItem(vars, item);
            Object raw = field == null ? null : Expr.eval(field, vars);
            double number = raw instanceof Number ? ((Number) raw).doubleValue() : NodeSupport.parseDouble(raw);
            sum += number;
            min = Math.min(min, number);
            max = Math.max(max, number);
            if ("group".equals(op)) {
                Object key = Expr.eval(node.getString("by"), vars);
                String k = String.valueOf(key);
                JSONArray bucket = groups.getJSONArray(k);
                if (bucket == null) {
                    bucket = new JSONArray();
                    groups.put(k, bucket);
                }
                bucket.add(item);
            }
            NodeSupport.restoreItem(vars, saved);
        }
        switch (op) {
            case "sum":
                vars.put(node.getString("out"), sum);
                break;
            case "avg":
                vars.put(node.getString("out"), items.isEmpty() ? 0 : sum / items.size());
                break;
            case "min":
                vars.put(node.getString("out"), items.isEmpty() ? 0 : min);
                break;
            case "max":
                vars.put(node.getString("out"), items.isEmpty() ? 0 : max);
                break;
            case "group":
                vars.put(node.getString("out"), groups);
                break;
            default:
                throw new IllegalArgumentException("不支持的聚合操作: " + op);
        }
    }

    private void doBranch(JSONObject node) throws Exception {
        JSONArray cases = node.getJSONArray("cases");
        if (cases != null) {
            for (int i = 0; i < cases.size(); i++) {
                JSONObject item = cases.getJSONObject(i);
                if (Expr.evalBool(item.getString("when"), vars)) {
                    executeBody(item.getJSONArray("body"));
                    return;
                }
            }
        }
        executeBody(node.getJSONArray("default"));
    }

    void executeBody(JSONArray body) throws Exception {
        if (body == null) return;
        for (int i = 0; i < body.size(); i++) {
            String id = body.getString(i);
            JSONObject node = nodes.get(id);
            if (node == null) throw new IllegalStateException("循环/分支体节点不存在: " + id);
            executeNode(node);
        }
    }

    // ------------------------------------------------------------------
    // 循环（实现见 LoopRunner）
    // ------------------------------------------------------------------

    void enterLoop() {
        if (loopDepth >= MAX_LOOP_DEPTH) {
            throw new IllegalStateException("循环嵌套超过 " + MAX_LOOP_DEPTH + " 层");
        }
        loopDepth++;
    }

    void exitLoop() {
        if (loopDepth > 0) loopDepth--;
    }

    void registerLoopSummary(String loopId, JSONObject summary) {
        loopSummaries.put(loopId, summary);
        vars.put("loop_" + loopId, summary);
    }

    private void doLoop(JSONObject node) throws Exception {
        new LoopRunner(this, node).run();
    }

    // ------------------------------------------------------------------
    // 工具
    // ------------------------------------------------------------------

    private String startNode() {
        for (int i = 0; i < edges.size(); i++) {
            JSONArray edge = edges.getJSONArray(i);
            if (edge != null && "start".equals(edge.getString(0))) return edge.getString(1);
        }
        return nodes.keySet().iterator().next();
    }

    private String nextNode(String id) {
        for (int i = 0; i < edges.size(); i++) {
            JSONArray edge = edges.getJSONArray(i);
            if (edge != null && id.equals(edge.getString(0))) return edge.getString(1);
        }
        return null;
    }

    private JSONObject exposedVars() {
        JSONObject out = new JSONObject(true);
        if (meta != null && meta.getJSONArray("resultVars") != null) {
            JSONArray keys = meta.getJSONArray("resultVars");
            for (int i = 0; i < keys.size(); i++) {
                String key = keys.getString(i);
                out.put(key, vars.get(key));
            }
        }
        return out;
    }
}
