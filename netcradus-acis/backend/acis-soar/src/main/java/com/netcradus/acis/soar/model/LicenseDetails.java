package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;
import java.util.UUID;

@Data
@Entity
@Table(name = "license_details")
public class LicenseDetails {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false,
            columnDefinition = "uuid default '00000000-0000-0000-0000-000000000001'")
    private UUID tenantId;

    @Column(name = "plan_name")
    private String planName;

    @Column(name = "plan_price")
    private String planPrice;

    @Column(name = "plan_features")
    private String planFeatures;

    @Column(name = "endpoints_monitored")
    private Integer endpointsMonitored;

    @Column(name = "endpoints_limit")
    private Integer endpointsLimit;

    @Column(name = "data_ingestion")
    private Double dataIngestion;

    @Column(name = "data_ingestion_limit")
    private Double dataIngestionLimit;

    @Column(name = "api_calls")
    private Integer apiCalls;

    @Column(name = "api_calls_limit")
    private Integer apiCallsLimit;

    @Column(name = "card_brand")
    private String cardBrand;

    @Column(name = "card_last_4")
    private String cardLast4;

    @Column(name = "card_expiry")
    private String cardExpiry;

    @Column(name = "billing_details")
    private String billingDetails;
}
