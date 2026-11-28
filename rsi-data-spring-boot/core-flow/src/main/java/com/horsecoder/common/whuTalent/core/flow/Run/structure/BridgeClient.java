package com.horsecoder.common.whuTalent.core.flow.Run.structure;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * 调用本地 AutomationBench WorldState bridge。
 *
 * POST /tool  {"name": "...", "arguments": {...}} -> {"result": "..."}
 */
public class BridgeClient {

    private static final MediaType JSON_TYPE = MediaType.parse("application/json; charset=utf-8");
    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(180, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build();

    private final String baseUrl;

    public BridgeClient(String baseUrl) {
        String url = baseUrl == null || baseUrl.trim().isEmpty()
                ? "http://127.0.0.1:8765"
                : baseUrl.trim();
        while (url.endsWith("/")) url = url.substring(0, url.length() - 1);
        this.baseUrl = url;
    }

    public Object call(String tool, Map<String, Object> arguments) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("name", tool);
        payload.put("arguments", arguments == null ? new JSONObject() : arguments);

        Request request = new Request.Builder()
                .url(baseUrl + "/tool")
                .post(RequestBody.create(JSON_TYPE, payload.toJSONString()))
                .build();
        Response response = CLIENT.newCall(request).execute();
        String body;
        try {
            body = response.body() == null ? "" : response.body().string();
        } finally {
            response.close();
        }
        if (!response.isSuccessful()) {
            throw new IllegalStateException("bridge HTTP " + response.code() + ": " + body);
        }
        JSONObject json = JSON.parseObject(body);
        if (json == null) throw new IllegalStateException("bridge returned non-JSON: " + body);
        if (json.containsKey("error")) {
            throw new IllegalStateException("bridge error: " + json.getString("error"));
        }
        Object result = json.get("result");
        if (result instanceof String) {
            String text = (String) result;
            String trimmed = text.trim();
            if ((trimmed.startsWith("{") && trimmed.endsWith("}"))
                    || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
                try {
                    return JSON.parse(text);
                } catch (Exception ignore) {
                    return text;
                }
            }
        }
        return result;
    }

    public JSONObject getJson(String path) throws Exception {
        Request request = new Request.Builder().url(baseUrl + path).get().build();
        Response response = CLIENT.newCall(request).execute();
        String body;
        try {
            body = response.body() == null ? "" : response.body().string();
        } finally {
            response.close();
        }
        if (!response.isSuccessful()) {
            throw new IllegalStateException("bridge HTTP " + response.code() + ": " + body);
        }
        return JSON.parseObject(body);
    }

    public String baseUrl() {
        return baseUrl;
    }
}
