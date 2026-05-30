# NETCRADUS ACIS — Infrastructure Plan

**Document Version:** 1.0  
**Date:** May 2026  
**Classification:** Internal — Infrastructure / DevOps  
**Author:** Kumar Ujjwal  

---

## 1. Infrastructure Overview

This document defines the infrastructure requirements, capacity planning, networking, security posture, and operational procedures for running the NETCRADUS ACIS platform in production.

---

## 2. Infrastructure Stack

| Component | Technology | Deployment Mode |
|---|---|---|
| **Container Runtime** | Docker 26.x | All environments |
| **Orchestration** | Kubernetes 1.29+ | Staging + Production |
| **Dev Environment** | Docker Compose 2.x | Local development only |
| **Helm** | Helm 3.x | K8s package management |
| **Service Mesh** | Istio (optional, production) | mTLS, traffic management |
| **GitOps** | ArgoCD (optional) | Declarative K8s management |
| **Cloud Provider** | AWS / GCP / Azure (agnostic) | Via CNCF-standard tooling |
| **DNS / CDN** | CloudFlare | Edge caching + DDoS protection |
| **Secrets** | Kubernetes Secrets + Vault (optional) | Credential management |

---

## 3. Compute Requirements

### 3.1 Development Environment (Single Machine)

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 8 cores | 12 cores |
| RAM | 16 GB | 32 GB |
| Disk | 50 GB SSD | 100 GB SSD |
| OS | Windows 11 / Ubuntu 22.04 / macOS 14 | — |
| Docker | Docker Desktop 4.x | — |

**Memory Budget (dev):**
```
postgres:         512 MB
keycloak:         512 MB
kafka:            512 MB
elasticsearch:    1,024 MB (ES_JAVA_OPTS: -Xms1g -Xmx1g)
clickhouse:       512 MB
minio:            256 MB
prometheus:       256 MB
grafana:          256 MB
8x spring-boot:   8 × 512 MB = 4,096 MB
ai-service:       2,048 MB
frontend (vite):  256 MB
─────────────────────────
TOTAL:           ~10 GB active, 16 GB minimum recommended
```

### 3.2 Production Kubernetes Cluster

#### Control Plane Nodes (3x for HA)

| Resource | Per Node | Total |
|---|---|---|
| CPU | 4 vCPU | 12 vCPU |
| RAM | 8 GB | 24 GB |
| Disk | 50 GB SSD (etcd) | 150 GB |

#### Worker Nodes — Backend Services

| Node Pool | Count | CPU | RAM | Disk | Purpose |
|---|---|---|---|---|---|
| `backend-pool` | 3 nodes | 8 vCPU | 16 GB | 100 GB | Spring Boot services |
| `data-pool` | 3 nodes | 16 vCPU | 64 GB | 1 TB NVMe | ES, Kafka, PG, CH |
| `ai-pool` | 2 nodes | 8 vCPU (+ GPU optional) | 32 GB | 200 GB | Python AI service |
| `frontend-pool` | 2 nodes | 4 vCPU | 8 GB | 50 GB | nginx frontend |
| `monitoring-pool` | 1 node | 4 vCPU | 8 GB | 200 GB | Prometheus, Grafana, Jaeger |

#### Total Production Cluster (Initial)

| Resource | Total |
|---|---|
| vCPU | ~85 vCPU |
| RAM | ~296 GB |
| Storage | ~3.5 TB |

---

## 4. Storage Architecture

### 4.1 Storage Classification

| Tier | Technology | Data Type | Retention | Access Pattern |
|---|---|---|---|---|
| **Hot** | Elasticsearch 8.x | Raw + normalised security events | 14 days | Real-time search, sub-second |
| **Warm** | ClickHouse 24.x | Aggregated time-series metrics | 90 days | Analytics queries, dashboards |
| **Cold** | PostgreSQL 16 | Metadata (alerts, incidents, rules, users) | Indefinite | OLTP, transactional |
| **Archive** | MinIO / S3 | Reports, model snapshots, audit exports | 7 years (compliance) | Infrequent, bulk |

### 4.2 Elasticsearch Index Strategy

```
Index pattern: acis-events-{tenant_slug}-{YYYY.MM.dd}

Example indices:
  acis-events-acme-2026.05.29
  acis-events-acme-2026.05.28
  ...

Index lifecycle policy (ILM):
  Hot phase:    0-14 days    → 1 primary + 1 replica, NVMe storage
  Warm phase:   14-30 days   → force merge, reduced replicas, HDD
  Cold phase:   30-90 days   → read-only, snapshot to S3
  Delete phase: >90 days     → auto-delete indices

Shard sizing:
  Primary shards: 3 per index
  Replica shards: 1 per primary
  Max shard size: 50 GB
```

### 4.3 PostgreSQL Schema Sizing

```
Tables and estimated row volumes (per tenant, per year):
  alerts:           ~500,000 rows/year
  incidents:         ~50,000 rows/year
  correlation_rules:    ~100 rows (stable)
  playbooks:             ~50 rows (stable)
  playbook_executions: ~10,000 rows/year
  audit_log:       ~2,000,000 rows/year
  ioc_cache:          ~50,000 rows (rolling 24h TTL)
  assets:              ~5,000 rows (stable)
  users:                 ~100 rows (stable)

Estimated DB size: ~10 GB/tenant/year
```

### 4.4 Kafka Topic Configuration

```
Topics and configuration:

acis.raw.events:
  Partitions:        12 (scale-out for high ingest)
  Replication:       3
  Retention:         24 hours (hand-off to Elasticsearch)
  Cleanup policy:    delete

acis.normalized.events:
  Partitions:        12
  Replication:       3
  Retention:         24 hours
  Cleanup policy:    delete

acis.alerts:
  Partitions:        6
  Replication:       3
  Retention:         7 days
  Cleanup policy:    delete

acis.enriched.events:
  Partitions:        6
  Replication:       3
  Retention:         7 days

acis.playbook.actions:
  Partitions:        3
  Replication:       3
  Retention:         7 days

acis.dlq.events:
  Partitions:        3
  Replication:       3
  Retention:         30 days  (manual review)
```

---

## 5. Networking Architecture

### 5.1 Network Zones

```
┌─────────────────────────────────────────────────────────────────┐
│                    DMZ (Internet-facing)                        │
│  CloudFlare → Load Balancer → Ingress Controller (nginx)        │
│  Allowed inbound: 443 (HTTPS), 80 (redirect to 443)            │
└────────────────────────┬────────────────────────────────────────┘
                         │ (TLS termination at ingress)
┌────────────────────────▼────────────────────────────────────────┐
│                    Application Zone                             │
│  Namespace: acis-frontend, acis-backend, acis-ai                │
│  No direct internet access (egress via NAT gateway only)        │
│  Internal DNS: *.acis-backend.svc.cluster.local                 │
└────────────────────────┬────────────────────────────────────────┘
                         │ (ClusterIP services only)
┌────────────────────────▼────────────────────────────────────────┐
│                    Data Zone                                    │
│  Namespace: acis-data                                           │
│  PostgreSQL, Elasticsearch, Kafka, ClickHouse, MinIO            │
│  ONLY accepts connections from Application Zone                 │
│  NetworkPolicy: deny all → allow from acis-backend only         │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Kubernetes NetworkPolicy

```yaml
# Deny all ingress to data namespace by default
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: acis-data
spec:
  podSelector: {}
  policyTypes:
    - Ingress

---
# Allow only acis-backend services to reach PostgreSQL
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-backend-to-postgres
  namespace: acis-data
spec:
  podSelector:
    matchLabels:
      app: postgres
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: acis-backend
      ports:
        - port: 5432
```

### 5.3 Ingress Configuration

```yaml
# infra/k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: acis-ingress
  namespace: acis-frontend
  annotations:
    kubernetes.io/ingress.class: "nginx"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
    - hosts: [acis.netcradus.com]
      secretName: acis-tls-cert
  rules:
    - host: acis.netcradus.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: acis-gateway-svc
                port: { number: 8080 }
          - path: /
            pathType: Prefix
            backend:
              service:
                name: acis-frontend-svc
                port: { number: 80 }
```

---

## 6. Security Infrastructure

### 6.1 Keycloak Identity Provider Setup

```
Realm:       acis
Clients:
  · acis-frontend  (public client, PKCE)
  · acis-backend   (confidential, client credentials)

Roles:
  · viewer
  · analyst
  · engineer
  · admin

Realm settings:
  · SSO session idle:    30 min
  · SSO session max:     8 hours
  · Access token lifespan: 60 min
  · Refresh token lifespan: 8 hours
  · Brute force detection: enabled (lockout after 5 failures)
  · Password policy: min 12 chars, 1 uppercase, 1 number, 1 symbol

SMTP: configured for password reset, verification emails
```

### 6.2 TLS / Certificate Management

```
Development:
  · Self-signed certificates (dev only)
  · HTTPS not enforced

Staging:
  · cert-manager with Let's Encrypt staging CA
  · Ingress TLS enabled

Production:
  · cert-manager with Let's Encrypt production CA
  · Auto-renewal via ACME DNS-01 challenge
  · Inter-service mTLS via Istio service mesh
  · TLS 1.2 minimum (TLS 1.3 preferred)
  · Cipher suites: ECDHE-RSA-AES256-GCM-SHA384 and modern equivalents
```

### 6.3 Kubernetes Secrets Management

```yaml
# Secrets structure
acis-db-secret:
  DB_PASSWORD: <base64>

acis-kafka-secret:
  KAFKA_SASL_PASSWORD: <base64>

acis-ai-secret:
  OPENAI_API_KEY: <base64>
  ANTHROPIC_API_KEY: <base64>

acis-keycloak-secret:
  KEYCLOAK_CLIENT_SECRET: <base64>

acis-minio-secret:
  MINIO_ROOT_USER: <base64>
  MINIO_ROOT_PASSWORD: <base64>

# All secrets: type=Opaque, mounted as env vars
# Never stored in source code or Helm values
# Managed via: kubectl create secret generic / external-secrets operator
```

### 6.4 PostgreSQL Row Level Security

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE correlation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: services can only see their tenant's data
CREATE POLICY tenant_isolation ON alerts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Spring Boot sets this at request start:
-- SET LOCAL app.current_tenant_id = '{tenant_id_from_jwt}';
```

---

## 7. Observability Infrastructure

### 7.1 Prometheus Configuration

```yaml
# infra/monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'acis-gateway'
    kubernetes_sd_configs:
      - role: pod
        namespaces: { names: ['acis-backend'] }
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: "true"
    metrics_path: /actuator/prometheus

  - job_name: 'acis-ai-service'
    static_configs:
      - targets: ['ai-service-svc.acis-ai:8090']
    metrics_path: /metrics

  - job_name: 'kafka'
    static_configs:
      - targets: ['kafka-jmx-exporter:9404']

  - job_name: 'elasticsearch'
    static_configs:
      - targets: ['elasticsearch-exporter:9114']

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']
```

### 7.2 Grafana Dashboards

| Dashboard | Panels |
|---|---|
| **Platform Overview** | Total events/hr, active alerts, system health status, service uptime |
| **Ingestion Pipeline** | Events/sec, Kafka lag per topic, normalisation error rate, DLQ size |
| **Detection Engine** | Flink job status, correlation rules firing rate, alert volume by severity |
| **SOAR Operations** | Playbook execution rate, step failure rate, MTTR trend |
| **AI Service** | Inference latency p50/p95/p99, model accuracy, LLM call duration |
| **Infrastructure** | CPU/RAM per node, disk I/O, network throughput, pod restarts |

### 7.3 Alert Rules (Prometheus Alertmanager)

```yaml
# infra/monitoring/alerting-rules.yaml
groups:
  - name: acis-critical
    rules:
      - alert: KafkaConsumerLagHigh
        expr: kafka_consumer_group_lag > 10000
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: "Kafka consumer lag exceeds 10,000 messages"

      - alert: ServiceDown
        expr: up{job=~"acis-.*"} == 0
        for: 1m
        labels: { severity: critical }
        annotations:
          summary: "ACIS service {{ $labels.job }} is down"

      - alert: ElasticsearchDiskUsageHigh
        expr: elasticsearch_filesystem_data_available_bytes /
              elasticsearch_filesystem_data_size_bytes < 0.15
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: "Elasticsearch disk usage > 85%"

      - alert: PostgresConnectionsHigh
        expr: pg_stat_activity_count > 80
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "PostgreSQL connections approaching limit"
```

---

## 8. Scalability & Performance Targets

### 8.1 Performance SLOs

| Metric | Target |
|---|---|
| Dashboard load time | < 2 seconds |
| Log search query latency | < 500ms (p95) |
| Alert creation → UI push | < 1 second |
| Playbook execution start | < 2 seconds |
| IOC enrichment (cache hit) | < 50ms |
| IOC enrichment (LLM call) | < 5 seconds |
| Report generation (PDF) | < 10 seconds |
| API uptime | 99.9% (< 44 min/month downtime) |

### 8.2 Throughput Targets

| Metric | Target |
|---|---|
| Event ingest rate | 100,000 events/hour sustained |
| Peak ingest | 500,000 events/hour (burst 5 min) |
| Kafka throughput | 10 MB/s sustained |
| Elasticsearch indexing | 5,000 documents/second |
| Concurrent WebSocket clients | 500 per instance |
| Concurrent API requests | 1,000 req/min per tenant |

### 8.3 Horizontal Scaling Triggers (HPA)

```yaml
# Horizontal Pod Autoscaler for alerts service
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: acis-alerts-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: acis-alerts
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

---

## 9. Environment Variables Reference

### 9.1 Complete .env Reference

```env
# ── PostgreSQL ─────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_NAME=acis
DB_USER=acis
DB_PASSWORD=acis_dev_password

# ── Apache Kafka ────────────────────────────
KAFKA_BOOTSTRAP_SERVERS=localhost:9092

# ── Elasticsearch ───────────────────────────
ES_HOST=http://localhost:9200
ES_INDEX_PREFIX=acis-events

# ── Keycloak ────────────────────────────────
KEYCLOAK_URL=http://localhost:8180
KEYCLOAK_REALM=acis
KEYCLOAK_CLIENT_ID=acis-backend
KEYCLOAK_CLIENT_SECRET=change_me_in_prod

# ── AI Service ──────────────────────────────
AI_SERVICE_URL=http://localhost:8090
AI_SERVICE_GRPC_PORT=50051
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# ── MinIO / S3 ──────────────────────────────
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=acis
S3_SECRET_KEY=acis_minio_password
S3_BUCKET=acis-reports

# ── Frontend (Vite) ─────────────────────────
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080/ws
VITE_KEYCLOAK_URL=http://localhost:8180
VITE_KEYCLOAK_REALM=acis
VITE_KEYCLOAK_CLIENT_ID=acis-frontend

# ── Monitoring ──────────────────────────────
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001
GRAFANA_ADMIN_PASSWORD=admin

# ── ClickHouse ──────────────────────────────
CLICKHOUSE_HOST=localhost
CLICKHOUSE_HTTP_PORT=8123
CLICKHOUSE_TCP_PORT=9000
```

---

## 10. Runbook — Common Operations

### 10.1 Restart a Service

```bash
# Rolling restart (zero downtime)
kubectl rollout restart deployment/acis-alerts -n acis-backend

# Check status
kubectl rollout status deployment/acis-alerts -n acis-backend
```

### 10.2 Scale a Service

```bash
kubectl scale deployment acis-alerts --replicas=5 -n acis-backend
```

### 10.3 View Live Logs

```bash
# Stream logs from all alerts service pods
kubectl logs -f -l app=acis-alerts -n acis-backend

# Last 100 lines from specific pod
kubectl logs acis-alerts-abc123 -n acis-backend --tail=100
```

### 10.4 Check Kafka Consumer Lag

```bash
kubectl exec -it kafka-0 -n acis-data -- \
  kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe --all-groups
```

### 10.5 Emergency: Isolate a Compromised Tenant

```bash
# Step 1: Revoke all Keycloak sessions for tenant
# (Keycloak admin REST API)
curl -X POST \
  http://keycloak:8080/admin/realms/acis/users/{userId}/logout \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Step 2: Suspend API keys
kubectl exec -it postgres-0 -n acis-data -- psql -U acis -c \
  "UPDATE api_keys SET revoked = true WHERE tenant_id = '{tenant_id}';"

# Step 3: Block at gateway (add to deny-list)
kubectl annotate ingress acis-ingress \
  nginx.ingress.kubernetes.io/configuration-snippet="deny {tenant_ip};"
```

### 10.6 Run a Full Database Backup

```bash
# PostgreSQL dump
kubectl exec -it postgres-0 -n acis-data -- \
  pg_dump -U acis acis | gzip > backup-$(date +%F).sql.gz

# Upload to MinIO
mc cp backup-$(date +%F).sql.gz minio/acis-backups/postgres/
```

---

*Document Version 1.0 — NETCRADUS ACIS Infrastructure*  
