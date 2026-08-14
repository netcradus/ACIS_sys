package com.netcradus.acis.gateway.filter.waf;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.regex.Matcher;

/**
 * Real, signature-based detection of the classic injection/RCE attack
 * families against request path + query string + (capped, text-typed)
 * request body. Deliberately simple regex signatures rather than a full
 * parser — the same category of approach used by ModSecurity's CRS and
 * most edge WAFs — bounded patterns only (no nested quantifiers) to avoid
 * ReDoS on attacker-controlled input, which is exactly the kind of input
 * this class exists to be safe against.
 */
@Component
public class WafRuleEngine {

    private final List<WafRule> rules = List.of(
            // --- SQL Injection ---
            WafRule.of("SQLI-001", WafCategory.SQLI, "CRITICAL", "\\bunion\\b\\s{1,20}\\bselect\\b"),
            WafRule.of("SQLI-002", WafCategory.SQLI, "HIGH", "\\bor\\b\\s{1,10}1\\s*=\\s*1\\b"),
            WafRule.of("SQLI-003", WafCategory.SQLI, "CRITICAL", ";\\s{0,5}drop\\s{1,10}table\\b"),
            WafRule.of("SQLI-004", WafCategory.SQLI, "HIGH", "\\bsleep\\(\\s{0,5}\\d{1,6}\\s{0,5}\\)"),
            WafRule.of("SQLI-005", WafCategory.SQLI, "CRITICAL", "\\bxp_cmdshell\\b"),
            WafRule.of("SQLI-006", WafCategory.SQLI, "HIGH", "\\binformation_schema\\.(tables|columns)\\b"),
            WafRule.of("SQLI-007", WafCategory.SQLI, "MEDIUM", "'\\s{0,5}(or|and)\\s{1,5}'\\w{0,10}'\\s{0,5}="),

            // --- Cross-Site Scripting ---
            WafRule.of("XSS-001", WafCategory.XSS, "HIGH", "<script\\b"),
            WafRule.of("XSS-002", WafCategory.XSS, "HIGH", "javascript:"),
            WafRule.of("XSS-003", WafCategory.XSS, "MEDIUM", "on(error|load|mouseover|focus)\\s*="),
            WafRule.of("XSS-004", WafCategory.XSS, "MEDIUM", "<img[^>]{0,80}\\bonerror\\b"),
            WafRule.of("XSS-005", WafCategory.XSS, "MEDIUM", "document\\.cookie"),
            WafRule.of("XSS-006", WafCategory.XSS, "MEDIUM", "<svg[^>]{0,80}\\bonload\\b"),

            // --- Command Injection ---
            WafRule.of("CMDI-001", WafCategory.CMDI, "CRITICAL", ";\\s{0,5}(cat|ls|whoami|wget|curl|nc|bash|sh)\\b"),
            WafRule.of("CMDI-002", WafCategory.CMDI, "CRITICAL", "\\|\\s{0,5}(cat|ls|whoami|id|nc)\\b"),
            WafRule.of("CMDI-003", WafCategory.CMDI, "HIGH", "&&\\s{0,5}(rm|cat|ls|wget|curl)\\b"),
            WafRule.of("CMDI-004", WafCategory.CMDI, "HIGH", "\\$\\([^)]{1,60}\\)"),
            WafRule.of("CMDI-005", WafCategory.CMDI, "HIGH", "`[^`]{1,60}`"),

            // --- Path Traversal ---
            WafRule.of("TRAV-001", WafCategory.PATH_TRAVERSAL, "HIGH", "(\\.\\./){2,}"),
            WafRule.of("TRAV-002", WafCategory.PATH_TRAVERSAL, "HIGH", "(\\.\\.\\\\){2,}"),
            WafRule.of("TRAV-003", WafCategory.PATH_TRAVERSAL, "CRITICAL", "/etc/passwd\\b"),
            WafRule.of("TRAV-004", WafCategory.PATH_TRAVERSAL, "MEDIUM", "\\bwin\\.ini\\b"),

            // --- Remote Code Execution / Deserialization / Log4Shell ---
            WafRule.of("RCE-001", WafCategory.RCE, "CRITICAL", "\\$\\{jndi:(ldap|rmi|dns)s?:"),
            WafRule.of("RCE-002", WafCategory.RCE, "HIGH", "java\\.lang\\.runtime\\b"),
            WafRule.of("RCE-003", WafCategory.RCE, "HIGH", "processbuilder\\b"),
            WafRule.of("RCE-004", WafCategory.RCE, "MEDIUM", "base64_decode\\s{0,5}\\("),
            WafRule.of("RCE-005", WafCategory.RCE, "HIGH", "\\beval\\s{0,5}\\("),
            WafRule.of("RCE-006", WafCategory.RCE, "MEDIUM", "\\bO:\\d{1,4}:\"")
    );

    /** First matching rule against the given content, or null if clean. Content should already be capped in size by the caller. */
    public WafRule match(String content) {
        if (content == null || content.isEmpty()) {
            return null;
        }
        for (WafRule rule : rules) {
            Matcher m = rule.pattern().matcher(content);
            if (m.find()) {
                return rule;
            }
        }
        return null;
    }

    public List<WafRule> rules() {
        return rules;
    }
}
