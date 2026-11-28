package com.horsecoder.common.whuTalent.core.flow.Run.structure;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

import java.util.concurrent.TimeUnit;

/**
 * OpenAI 兼容模型客户端，供 extract 节点做语义抽取。
 *
 * 配置优先级：节点字段 > flow.llm.* 系统属性 > 环境变量。
 * 环境变量：OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL。
 */
public class ModelClient {

    private static final MediaType JSON_TYPE = MediaType.parse("application/json; charset=utf-8");
    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(180, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build();

    private final String baseUrl;
    private final String apiKey;
    private final String defaultModel;

    public ModelClient() {
        this.baseUrl = firstNonBlank(
                System.getProperty("flow.llm.baseUrl"),
                System.getenv("OPENAI_BASE_URL"),
                "https://api.openai.com/v1");
        this.apiKey = firstNonBlank(
                System.getProperty("flow.llm.apiKey"),
                System.getenv("OPENAI_API_KEY"),
                null);
        this.defaultModel = firstNonBlank(
                System.getProperty("flow.llm.model"),
                System.getenv("OPENAI_MODEL"),
                "gpt-5.6-sol");
    }

    /**
     * 一次 chat/completions 调用，返回助手文本（已去除 Markdown 代码围栏）。
     */
    public String complete(String system,
                           String prompt,
                           String model,
                           Double temperature,
                           Integer maxTokens,
                           String reasoningEffort) throws Exception {
        if (apiKey == null) {
            throw new IllegalStateException("extract 节点需要 OPENAI_API_KEY（或 flow.llm.apiKey）");
        }
        String chosenModel = firstNonBlank(model, defaultModel, "gpt-5.6-sol");

        JSONArray messages = new JSONArray();
        if (system != null && !system.trim().isEmpty()) {
            JSONObject systemMessage = new JSONObject();
            systemMessage.put("role", "system");
            systemMessage.put("content", system);
            messages.add(systemMessage);
        }
        JSONObject userMessage = new JSONObject();
        userMessage.put("role", "user");
        userMessage.put("content", prompt == null ? "" : prompt);
        messages.add(userMessage);

        JSONObject body = new JSONObject();
        body.put("model", chosenModel);
        body.put("messages", messages);
        if (temperature != null) body.put("temperature", temperature);
        if (maxTokens != null) body.put("max_completion_tokens", maxTokens);
        if (reasoningEffort != null && !reasoningEffort.trim().isEmpty()) {
            body.put("reasoning_effort", reasoningEffort);
        }

        String url = trimTrailingSlash(baseUrl) + "/chat/completions";
        Request request = new Request.Builder()
                .url(url)
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .post(RequestBody.create(JSON_TYPE, body.toJSONString()))
                .build();

        Response response = CLIENT.newCall(request).execute();
        String responseBody;
        try {
            responseBody = response.body() == null ? "" : response.body().string();
        } finally {
            response.close();
        }
        if (!response.isSuccessful()) {
            throw new IllegalStateException("模型 HTTP " + response.code() + ": " + shorten(responseBody));
        }

        JSONObject json = JSON.parseObject(responseBody);
        JSONArray choices = json == null ? null : json.getJSONArray("choices");
        if (choices == null || choices.isEmpty()) {
            throw new IllegalStateException("模型返回没有 choices: " + shorten(responseBody));
        }
        JSONObject message = choices.getJSONObject(0).getJSONObject("message");
        String content = message == null ? null : message.getString("content");
        if (content == null || content.trim().isEmpty()) {
            content = message == null ? null : message.getString("reasoning_content");
        }
        if (content == null) {
            throw new IllegalStateException("模型返回没有 content: " + shorten(responseBody));
        }
        return content.trim();
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) return value;
        }
        return null;
    }

    private static String trimTrailingSlash(String value) {
        String result = value;
        while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
        return result;
    }

    private static String shorten(String value) {
        if (value == null) return "";
        return value.length() <= 500 ? value : value.substring(0, 500) + "...";
    }
}
