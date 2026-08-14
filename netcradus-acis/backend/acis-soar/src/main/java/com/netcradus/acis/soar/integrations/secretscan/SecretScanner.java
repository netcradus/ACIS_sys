package com.netcradus.acis.soar.integrations.secretscan;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Real, local, no-external-dependency secrets/credential-exposure scanning -
 * signature patterns for the credential formats vendors actually publish
 * (recognizable prefixes: AKIA, ghp_, xox*, AIza, etc.) plus a few
 * labeled-context generic patterns (password=/api_key=/secret=). Every match
 * is redacted to a short prefix before being returned or stored - the real
 * secret value is never persisted or logged.
 */
@Component
public class SecretScanner {

    public record Rule(String name, String severity, Pattern pattern) {}

    private final List<Rule> rules = List.of(
            new Rule("AWS Access Key ID", "CRITICAL", Pattern.compile("AKIA[0-9A-Z]{16}")),
            new Rule("AWS Secret Access Key", "CRITICAL",
                    Pattern.compile("(?i)aws_secret_access_key\\s*[:=]\\s*['\"]?[A-Za-z0-9/+=]{40}['\"]?")),
            new Rule("Private Key Block", "CRITICAL",
                    Pattern.compile("-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----")),
            new Rule("GitHub Personal Access Token", "CRITICAL", Pattern.compile("ghp_[A-Za-z0-9]{36}")),
            new Rule("GitHub OAuth/App Token", "CRITICAL", Pattern.compile("gh[ousr]_[A-Za-z0-9]{36,}")),
            new Rule("Slack Token", "HIGH", Pattern.compile("xox[baprs]-[0-9A-Za-z-]{10,48}")),
            new Rule("Google API Key", "HIGH", Pattern.compile("AIza[0-9A-Za-z\\-_]{35}")),
            new Rule("Stripe Live Secret Key", "CRITICAL", Pattern.compile("sk_live_[0-9a-zA-Z]{20,}")),
            new Rule("JWT-like Token", "MEDIUM",
                    Pattern.compile("eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}")),
            new Rule("Generic API Key Assignment", "HIGH",
                    Pattern.compile("(?i)(api[_-]?key|secret|token)\\s*[:=]\\s*['\"][A-Za-z0-9_\\-]{20,}['\"]")),
            new Rule("Generic Password Assignment", "MEDIUM",
                    Pattern.compile("(?i)password\\s*[:=]\\s*['\"][^'\"\\s]{8,}['\"]"))
    );

    public record Match(String ruleName, String severity, int lineNumber, String redactedMatch) {}

    public List<Match> scan(String content) {
        List<Match> matches = new ArrayList<>();
        if (content == null || content.isEmpty()) {
            return matches;
        }
        String[] lines = content.split("\n", -1);
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            for (Rule rule : rules) {
                Matcher m = rule.pattern().matcher(line);
                if (m.find()) {
                    matches.add(new Match(rule.name(), rule.severity(), i + 1, redact(m.group())));
                }
            }
        }
        return matches;
    }

    private String redact(String matched) {
        if (matched.length() <= 6) {
            return "*".repeat(matched.length());
        }
        return matched.substring(0, 6) + "*".repeat(Math.min(matched.length() - 6, 20));
    }
}
