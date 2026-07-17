package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;
import java.util.UUID;

@Data
@Entity
@Table(name = "data_sources")
public class DataSource {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false,
            columnDefinition = "uuid default '00000000-0000-0000-0000-000000000001'")
    private UUID tenantId;

    private String name;
    
    private String provider; // AWS, AZ, SP, SYS, etc.
    
    private String description;
    
    private String status; // Connected, Not connected
    
    @Column(name = "last_sync")
    private String lastSync;
}
