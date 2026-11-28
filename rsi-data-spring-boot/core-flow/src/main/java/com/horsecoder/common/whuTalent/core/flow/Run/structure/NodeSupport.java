package com.horsecoder.common.whuTalent.core.flow.Run.structure;

import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 节点实现的纯工具方法：数组转换、数字解析、item 绑定、checkpoint 落盘。
 */
final class NodeSupport {

    private NodeSupport() {
    }

    static List<Object> toList(Object value) {
        List<Object> out = new ArrayList<>();
        if (value == null) return out;
        if (value instanceof JSONArray) {
            out.addAll((JSONArray) value);
        } else if (value instanceof List) {
            out.addAll((List<?>) value);
        } else if (value instanceof Object[]) {
            for (Object item : (Object[]) value) out.add(item);
        } else {
            out.add(value);
        }
        return out;
    }

    static String itemId(Object item) {
        if (item instanceof JSONObject) {
            JSONObject obj = (JSONObject) item;
            for (String key : obj.keySet()) {
                if ("id".equalsIgnoreCase(key)) return String.valueOf(obj.get(key));
            }
        }
        return item == null ? "" : String.valueOf(item);
    }

    static double parseDouble(Object value) {
        if (value == null) return 0;
        try {
            return Double.parseDouble(String.valueOf(value)
                    .replace(",", "").replace("$", "").trim());
        } catch (Exception e) {
            return 0;
        }
    }

    static String format(double value, String format) {
        if ("money".equals(format)) {
            return new java.text.DecimalFormat("#,##0.##",
                    new java.text.DecimalFormatSymbols(java.util.Locale.US)).format(value);
        }
        if ("int".equals(format)) return String.valueOf(Math.round(value));
        if ("floor".equals(format)) return String.valueOf((long) Math.floor(value));
        return String.valueOf(value);
    }

    static Map<String, Object> bindItem(Map<String, Object> vars, Object item) {
        Map<String, Object> saved = new HashMap<>();
        saved.put("item", vars.get("item"));
        saved.put("it", vars.get("it"));
        vars.put("item", item);
        vars.put("it", item);
        return saved;
    }

    static void restoreItem(Map<String, Object> vars, Map<String, Object> saved) {
        if (saved.get("item") == null) vars.remove("item"); else vars.put("item", saved.get("item"));
        if (saved.get("it") == null) vars.remove("it"); else vars.put("it", saved.get("it"));
    }

    static void appendCheckpoint(String file, String loopId, JSONObject checkpoint) {
        if (file == null || file.trim().isEmpty()) return;
        try {
            java.nio.file.Path path = java.nio.file.Paths.get(file);
            if (path.getParent() != null) java.nio.file.Files.createDirectories(path.getParent());
            String line = "{\"loop\":\"" + loopId + "\"," + checkpoint.toJSONString().substring(1) + "\n";
            java.nio.file.Files.write(path, line.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                    java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
        } catch (Exception ignore) {
            // 落盘失败不影响主流程
        }
    }
}
