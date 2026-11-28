package com.horsecoder.common.whuTalent.core.flow.Skill.code;

import cc.eamon.open.flow.core.FlowEngine;
import cc.eamon.open.flow.core.stereotype.Flow;
import cc.eamon.open.flow.spring.FlowComponent;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.horsecoder.common.whuTalent.core.flow.Run.structure.BridgeClient;

import java.util.HashMap;
import java.util.Map;

/**
 * 通用取数 skill：由引擎执行的 api_fetch 包装。
 *
 * 结构里的节点只要声明 skillFlow=@.../FLOW_SKILL_FETCH，
 * 解释器就会通过 FlowEngine.run 调用它，而不是直连 bridge。
 */
@FlowComponent
public class FlowCodeFetch {

    @Flow("FLOW_CODE_FETCH")
    public void flowCodeFetch(String method, String url, String paramsJson, String bodyJson) {
        Map<String, Object> args = new HashMap<>();
        args.put("method", method == null || method.isEmpty() ? "GET" : method);
        args.put("url", url);
        if (paramsJson != null && !paramsJson.trim().isEmpty() && !"null".equals(paramsJson.trim())) {
            args.put("params", JSON.parseObject(paramsJson));
        }
        if (bodyJson != null && !bodyJson.trim().isEmpty() && !"null".equals(bodyJson.trim())) {
            Object body = JSON.parse(bodyJson);
            args.put("body", body);
        }
        String result = null;
        try {
            Object value = new BridgeClient(null).call("api_fetch", args);
            result = value instanceof String ? (String) value : JSON.toJSONString(value);
        } catch (Exception e) {
            JSONObject error = new JSONObject();
            error.put("error", e.getMessage());
            result = error.toJSONString();
        }
        FlowEngine.instance().register("result", result);
    }
}
