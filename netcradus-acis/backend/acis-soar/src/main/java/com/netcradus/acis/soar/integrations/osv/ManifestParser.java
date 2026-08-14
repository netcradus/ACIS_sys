package com.netcradus.acis.soar.integrations.osv;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Extracts (ecosystem, package name, version) triples from a real dependency
 * manifest's raw text - Maven's pom.xml or npm's package.json. Deliberately
 * regex/streaming-based rather than a full XML/build-tool dependency
 * resolver: this reads exactly what's declared in the file, not the
 * resolved transitive tree a real `mvn dependency:tree`/`npm ls` would
 * produce - a real, honest limitation, not a shortcut disguised as complete.
 */
@Component
public class ManifestParser {

    private static final Pattern DEPENDENCY_BLOCK = Pattern.compile(
            "<dependency>\\s*<groupId>([^<]+)</groupId>\\s*<artifactId>([^<]+)</artifactId>\\s*<version>([^<]+)</version>",
            Pattern.MULTILINE);

    private final ObjectMapper objectMapper = new ObjectMapper();

    public List<OsvClient.DependencyRef> parsePomXml(String xml) {
        List<OsvClient.DependencyRef> deps = new ArrayList<>();
        Matcher m = DEPENDENCY_BLOCK.matcher(xml);
        while (m.find()) {
            String groupId = m.group(1).trim();
            String artifactId = m.group(2).trim();
            String version = m.group(3).trim();
            // Skip Maven property placeholders like ${some.version} - not resolvable from this file alone.
            if (version.startsWith("${")) continue;
            deps.add(new OsvClient.DependencyRef("Maven", groupId + ":" + artifactId, version));
        }
        return deps;
    }

    public List<OsvClient.DependencyRef> parsePackageJson(String json) throws Exception {
        List<OsvClient.DependencyRef> deps = new ArrayList<>();
        JsonNode root = objectMapper.readTree(json);
        for (String field : List.of("dependencies", "devDependencies")) {
            JsonNode section = root.path(field);
            if (section.isObject()) {
                var it = section.fields();
                while (it.hasNext()) {
                    Map.Entry<String, JsonNode> entry = it.next();
                    String version = stripRangePrefix(entry.getValue().asText());
                    if (version.isBlank() || version.contains("*") || version.startsWith("git")
                            || version.startsWith("http") || version.startsWith("file:")) {
                        continue; // not a concrete resolvable version
                    }
                    deps.add(new OsvClient.DependencyRef("npm", entry.getKey(), version));
                }
            }
        }
        return deps;
    }

    private String stripRangePrefix(String version) {
        return version.replaceFirst("^[\\^~>=<\\s]+", "").trim();
    }
}
