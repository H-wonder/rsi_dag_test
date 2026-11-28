package com.horsecoder.common.whuTalent.core.flow.Run.structure;

import cc.eamon.open.flow.route.util.JexlUtils;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 表达式与模板：JEXL 求值 + {{var}} 渲染。
 */
public final class Expr {

    private static final Pattern TEMPLATE = Pattern.compile("\\{\\{(.+?)}}");

    private Expr() {
    }

    public static Object eval(String expression, Map<String, Object> vars) {
        if (expression == null) return null;
        String expr = expression.trim();
        if (expr.startsWith("$.")) expr = expr.substring(2);
        else if (expr.startsWith("$")) expr = expr.substring(1);
        if (vars.containsKey(expr)) return vars.get(expr);
        return JexlUtils.getVariable(expr, vars);
    }

    public static boolean evalBool(String expression, Map<String, Object> vars) {
        Object value = eval(expression, vars);
        if (value instanceof Boolean) return (Boolean) value;
        return value != null && Boolean.parseBoolean(String.valueOf(value));
    }

    /**
     * 递归渲染：字符串里的 {{expr}} 求值；若整串就是一个模板，返回原始对象。
     */
    public static Object render(Object value, Map<String, Object> vars) {
        if (value instanceof String) {
            String text = (String) value;
            // 整串是单个模板（内部不能再出现 {{ 或 }}）才返回原始对象
            if (text.startsWith("{{") && text.endsWith("}}")) {
                String inner = text.substring(2, text.length() - 2);
                if (!inner.contains("{{") && !inner.contains("}}")) {
                    return eval(inner, vars);
                }
            }
            Matcher m = TEMPLATE.matcher(text);
            StringBuffer sb = new StringBuffer();
            while (m.find()) {
                Object v = eval(m.group(1), vars);
                m.appendReplacement(sb, Matcher.quoteReplacement(v == null ? "" : String.valueOf(v)));
            }
            m.appendTail(sb);
            return sb.toString();
        }
        if (value instanceof JSONObject) {
            JSONObject src = (JSONObject) value;
            JSONObject out = new JSONObject(true);
            for (String key : src.keySet()) out.put(key, render(src.get(key), vars));
            return out;
        }
        if (value instanceof JSONArray) {
            JSONArray src = (JSONArray) value;
            JSONArray out = new JSONArray();
            for (Object item : src) out.add(render(item, vars));
            return out;
        }
        return value;
    }
}
