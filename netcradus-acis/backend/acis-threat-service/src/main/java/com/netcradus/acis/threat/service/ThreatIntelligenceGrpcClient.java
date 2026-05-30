package com.netcradus.acis.threat.service;

import com.netcradus.acis.ai.grpc.EnrichIocRequest;
import com.netcradus.acis.ai.grpc.EnrichIocResponse;
import com.netcradus.acis.ai.grpc.ThreatIntelServiceGrpc;
import lombok.extern.slf4j.Slf4j;
import net.devh.boot.grpc.client.inject.GrpcClient;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class ThreatIntelligenceGrpcClient {

    @GrpcClient("aiService")
    private ThreatIntelServiceGrpc.ThreatIntelServiceBlockingStub aiServiceStub;

    public EnrichIocResponse enrich(String indicator, String type) {
        log.info("Calling Python AI service via gRPC for IOC enrichment: {}", indicator);
        EnrichIocRequest req = EnrichIocRequest.newBuilder()
                .setIndicator(indicator)
                .setType(type)
                .build();
        try {
            return aiServiceStub.enrichIoc(req);
        } catch (Exception e) {
            log.error("Failed to enrich via AI gRPC service", e);
            throw e;
        }
    }
}
