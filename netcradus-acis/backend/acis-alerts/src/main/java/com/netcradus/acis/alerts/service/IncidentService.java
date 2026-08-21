package com.netcradus.acis.alerts.service;

import com.netcradus.acis.alerts.model.Incident;
import com.netcradus.acis.alerts.repository.IncidentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * Real persist + broadcast for incidents — mirrors AlertService's
 * saveAndBroadcast, since IncidentController previously called
 * incidentRepository.save() directly with no real-time channel at all (no
 * /topic/incidents existed anywhere before this).
 */
@Service
@RequiredArgsConstructor
public class IncidentService {

    private final IncidentRepository repository;
    private final SimpMessagingTemplate messagingTemplate;

    @Transactional
    public Incident saveAndBroadcast(Incident incident) {
        Incident saved = repository.save(incident);
        messagingTemplate.convertAndSend("/topic/incidents", saved);
        return saved;
    }

    /** Broadcasts a deletion so the frontend can drop it from state without a refetch. */
    public void delete(Incident incident) {
        repository.delete(incident);
        messagingTemplate.convertAndSend("/topic/incidents", Map.of("id", incident.getId(), "deleted", true));
    }
}
