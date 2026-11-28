package com.horsecoder.common.whuTalent.core.flow.Run.code;

import cc.eamon.open.flow.core.FlowEngine;
import cc.eamon.open.flow.core.stereotype.Flow;
import cc.eamon.open.flow.spring.FlowComponent;
import com.alibaba.fastjson.JSONObject;
import com.horsecoder.common.whuTalent.core.flow.Run.structure.BridgeClient;
import com.horsecoder.common.whuTalent.core.flow.Run.structure.StructureExecutor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;


/**
 * 运行
 *
 * @com.horsecoder.common.whuTalent.flowTesting.core/FLOW_RUN <p>
 * Author: horsecoder
 * Email: eamon@horsecoder.com
 */
@FlowComponent
public class FlowCodeRun {

    private static final Logger logger = LoggerFactory.getLogger(FlowCodeRun.class);

    /**
     * 运行
     * FLOW_CODE_RUN
     *
     * @param structure 结构
     * @result result 运行结果
     */
    @Flow("FLOW_CODE_RUN")
    public void flowCodeRun(
            String structure
    ) {
        int length = structure == null ? 0 : structure.length();
        String preview = structure != null && structure.length() > 500
                ? structure.substring(0, 500) + "..."
                : structure;
        logger.info("FLOW_RUN 收到 structure，长度={}，内容={}", length, preview);

        String result;
        try {
            JSONObject parsed = JSONObject.parseObject(structure);
            if (parsed == null || !parsed.containsKey("nodes")) {
                throw new IllegalArgumentException("结构缺少 nodes；画布 JSON 需要先转换为结构 schema");
            }
            JSONObject run = new StructureExecutor(parsed).run();
            JSONObject meta = parsed.getJSONObject("meta");
            String bridgeUrl = meta == null ? null : meta.getString("bridge");
            if (bridgeUrl != null && !bridgeUrl.trim().isEmpty()) {
                try {
                    JSONObject score = new BridgeClient(bridgeUrl).getJson("/score");
                    run.put("score", score);
                    logger.info("FLOW_RUN score={}，assertions={}/{}",
                            score.get("score"), score.get("assertions_passed"), score.get("assertions_total"));
                } catch (Exception scoreError) {
                    run.put("scoreError", scoreError.getMessage());
                    logger.warn("FLOW_RUN 取分失败: {}", scoreError.getMessage());
                }
            }
            logger.info("FLOW_RUN 完成，status={}，loops={}",
                    run.getString("status"), run.getJSONObject("loops"));
            result = run.toJSONString();
        } catch (Exception e) {
            logger.error("FLOW_RUN 执行失败", e);
            JSONObject error = new JSONObject(true);
            error.put("status", "ERROR");
            error.put("error", e.getMessage() == null ? e.toString() : e.getMessage());
            result = error.toJSONString();
        }

        FlowEngine.instance().register("result", result);

    }


}
