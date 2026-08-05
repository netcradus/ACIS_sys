package com.netcradus.acis.soar.integrations.paloalto;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Real calls against a Palo Alto firewall's PAN-OS XML API (the same API
 * Panorama and every third-party PAN-OS integration uses). Uses standard TLS
 * certificate validation — a firewall's management interface must present a
 * certificate the JVM's default trust store accepts (a valid CA-issued cert,
 * or the customer's internal CA imported into the JVM truststore); this
 * deliberately does not disable certificate verification, since doing so
 * would make every request forgeable by anyone on the network path.
 *
 * PAN-OS log retrieval is asynchronous: a query returns a job id, which must
 * be polled until the job finishes. See fetchTrafficLogs.
 */
@Slf4j
@Component
public class PaloAltoClient {

    private final RestTemplate restTemplate = new RestTemplate();
    private static final DateTimeFormatter PANOS_TIME =
            DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm:ss");

    /** Verifies the API key against the firewall's own identity check. Throws with a human-readable message on failure. */
    public void testConnection(String hostname, String apiKey) {
        String url = UriComponentsBuilder.fromHttpUrl("https://" + hostname + "/api/")
                .queryParam("type", "op")
                .queryParam("cmd", "<show><system><info></info></system></show>")
                .queryParam("key", apiKey)
                .toUriString();
        Document doc = execute(url);
        requireSuccess(doc, "Firewall rejected the request");
    }

    /**
     * Fetches traffic log entries received since {@code since}, as generic
     * field maps (whatever the firewall actually returned — no fixed field
     * list is assumed, so nothing here is fabricated or guessed).
     */
    public List<Map<String, Object>> fetchTrafficLogs(String hostname, String apiKey, OffsetDateTime since) {
        String query = "(receive_time geq '" + since.atZoneSameInstant(ZoneOffset.UTC).format(PANOS_TIME) + "')";
        String submitUrl = UriComponentsBuilder.fromHttpUrl("https://" + hostname + "/api/")
                .queryParam("type", "log")
                .queryParam("log-type", "traffic")
                .queryParam("nlogs", "200")
                .queryParam("dir", "forward")
                .queryParam("query", query)
                .queryParam("key", apiKey)
                .toUriString();
        Document submitDoc = execute(submitUrl);
        requireSuccess(submitDoc, "Firewall rejected the log query");
        String jobId = textOf(submitDoc, "job");
        if (jobId == null || jobId.isBlank()) {
            throw new PaloAltoApiException("Firewall did not return a job id for the log query");
        }

        // PAN-OS log jobs are async — poll until FIN, bounded so a slow/stuck
        // firewall can't hang the shared scheduler thread indefinitely.
        Document resultDoc = null;
        for (int attempt = 0; attempt < 10; attempt++) {
            String pollUrl = UriComponentsBuilder.fromHttpUrl("https://" + hostname + "/api/")
                    .queryParam("type", "log")
                    .queryParam("action", "get")
                    .queryParam("job-id", jobId)
                    .queryParam("key", apiKey)
                    .toUriString();
            resultDoc = execute(pollUrl);
            requireSuccess(resultDoc, "Firewall rejected the log job poll");
            String status = textOf(resultDoc, "status");
            if ("FIN".equalsIgnoreCase(status)) {
                break;
            }
            resultDoc = null;
            try {
                Thread.sleep(500);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                throw new PaloAltoApiException("Interrupted while waiting for firewall log job " + jobId);
            }
        }
        if (resultDoc == null) {
            throw new PaloAltoApiException("Firewall log job " + jobId + " did not finish in time");
        }

        List<Map<String, Object>> events = new ArrayList<>();
        NodeList entries = resultDoc.getElementsByTagName("entry");
        for (int i = 0; i < entries.getLength(); i++) {
            Node entry = entries.item(i);
            if (entry.getNodeType() != Node.ELEMENT_NODE) continue;
            Map<String, Object> event = new LinkedHashMap<>();
            event.put("source", "paloalto");
            NodeList children = entry.getChildNodes();
            for (int j = 0; j < children.getLength(); j++) {
                Node child = children.item(j);
                if (child.getNodeType() == Node.ELEMENT_NODE) {
                    event.put(child.getNodeName(), child.getTextContent());
                }
            }
            events.add(event);
        }
        return events;
    }

    private Document execute(String url) {
        try {
            String body = restTemplate.getForObject(url, String.class);
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            return factory.newDocumentBuilder().parse(new InputSource(new StringReader(body)));
        } catch (RestClientException e) {
            throw new PaloAltoApiException("Could not reach firewall at " + url.split("\\?")[0] + ": " + e.getMessage());
        } catch (PaloAltoApiException e) {
            throw e;
        } catch (Exception e) {
            throw new PaloAltoApiException("Could not parse firewall response: " + e.getMessage());
        }
    }

    private void requireSuccess(Document doc, String fallback) {
        Element root = doc.getDocumentElement();
        String status = root.getAttribute("status");
        if (!"success".equals(status)) {
            String msg = textOf(doc, "line");
            if (msg == null || msg.isBlank()) msg = textOf(doc, "msg");
            throw new PaloAltoApiException(msg != null && !msg.isBlank() ? msg : fallback);
        }
    }

    private String textOf(Document doc, String tag) {
        NodeList nodes = doc.getElementsByTagName(tag);
        return nodes.getLength() > 0 ? nodes.item(0).getTextContent() : null;
    }

    public static class PaloAltoApiException extends RuntimeException {
        public PaloAltoApiException(String message) {
            super(message);
        }
    }
}
