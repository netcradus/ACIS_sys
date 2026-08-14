package com.netcradus.acis.gateway.filter.waf;

import java.util.regex.Pattern;

/** One real detection signature. severity feeds AlertDto.severity directly (CRITICAL/HIGH/MEDIUM/LOW). */
public record WafRule(String id, WafCategory category, String severity, Pattern pattern) {

    public static WafRule of(String id, WafCategory category, String severity, String regex) {
        return new WafRule(id, category, severity, Pattern.compile(regex, Pattern.CASE_INSENSITIVE));
    }
}
