# NETCRADUS ACIS — System Architecture Document

**Document Version:** 1.0  
**Date:** May 2026  
**Classification:** Internal — Engineering  
**Author:** Kumar Ujjwal  
**Product:** ACIS — Autonomous Cyber Immune System  

---

## 1. Executive Summary

NETCRADUS ACIS is a commercial-grade, AI-powered cybersecurity platform combining SIEM, SOAR, and Self-Healing capabilities into a single unified SaaS product. It targets UK and global SMEs who cannot afford dedicated enterprise SOC teams, delivering capabilities comparable to Splunk + CrowdStrike + Darktrace at a fraction of the cost.

**Core Value Proposition:**  
- Autonomous threat detection with zero manual triage  
- AI-driven incident response via SOAR playbooks  
- Continuous red team validation of defences  
- Self-healing endpoint isolation and rollback  
- Compliance posture tracking (NIS2, GDPR, ISO 27001, UK Cyber Essentials)

---

## 2. Architectural Principles

| Principle | Description |
|---|---|
| **Multi-Tenancy First** | Every data entity is scoped by `tenant_id`. PostgreSQL Row Level Security enforces isolation at the DB layer. JWT claims carry tenant context. |
| **Event-Driven Core** | All security telemetry flows through Apache Kafka. No synchronous coupling between ingestion, detection, and response. |
| **AI at the Edge** | ML inference (anomaly detection, classification) runs as a dedicated Python microservice, decoupled from Java backend via gRPC. |
| **Defence in Depth** | TLS between all services, mTLS in production K8s, Keycloak as the single identity authority, all routes validated through the gateway. |
| **Horizontal Scalability** | Stateless Spring Boot services, Kafka consumer groups, Flink task parallelism, Elasticsearch sharding — all designed for horizontal scale-out. |
| **Observability First** | Prometheus metrics on all services, Jaeger distributed tracing, structured JSON logging aggregated via Elasticsearch. |

---

## 3. High-Level Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        NETCRADUS ACIS PLATFORM                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────────┐    ┌─────────────────────────────────────────┐  │
│   │  React SPA       │    │           External Data Sources          │  │
│   │  (Vite + TS)     │    │  EDR · Firewall · Cloud · Email · SIEM  │  │
│   │  13 Modules      │    └──────────────────┬──────────────────────┘  │
│   └────────┬─────────┘                       │ Syslog / CEF / JSON     │
│            │ HTTPS/WSS                        ▼                         │
│            ▼                       ┌──────────────────┐                │
│   ┌──────────────────┐             │  acis-ingestion  │                │
│   │  acis-gateway    │             │  (port 8084)     │                │
│   │  Spring Cloud    │             └────────┬─────────┘                │
│   │  Gateway (8080)  │                      │ Kafka Producer           │
│   │  JWT Validation  │                      ▼                          │
│   │  Rate Limiting   │             ┌──────────────────┐                │
│   │  CORS            │             │  Apache Kafka    │                │
│   └────────┬─────────┘             │  Topics:         │                │
│            │ Route to Services     │  ·raw.events     │                │
│            ▼                       │  ·normalized     │                │
│   ┌────────────────────────────┐   │  ·alerts         │                │
│   │    Backend Microservices   │   │  ·enriched       │                │
│   │                            │   │  ·playbook.cmds  │                │
│   │  acis-alerts   (8081)      │   │  ·dlq.events     │                │
│   │  acis-search   (8082)      │   └────────┬─────────┘                │
│   │  acis-correlation (8083)   │            │ Consumers                │
│   │  acis-ingestion  (8084)    │            ▼                          │
│   │  acis-soar      (8085)     │   ┌──────────────────┐                │
│   │  acis-assets    (8086)     │   │  Apache Flink    │                │
│   │  acis-threat-intel(8087)   │   │  CEP Engine      │                │
│   │  acis-reports   (8088)     │   │  Sliding Windows │                │
│   └─────────┬──────────────────┘   └────────┬─────────┘                │
│             │ gRPC                           │ Alert Events             │
│             ▼                               │                           │
│   ┌──────────────────┐          ┌───────────▼──────────┐               │
│   │   AI Service     │          │    Data Stores        │               │
│   │   Python FastAPI │          │                       │               │
│   │   (port 8090)    │          │  Elasticsearch 8.x   │               │
│   │                  │          │  (Hot: event index)  │               │
│   │  · IsolationForest│         │                       │               │
│   │  · XGBoost       │          │  ClickHouse          │               │
│   │  · LangChain     │          │  (Warm: time-series) │               │
│   │  · FAISS MITRE   │          │                       │               │
│   └──────────────────┘          │  PostgreSQL 16        │               │
│                                 │  (Cold: metadata)     │               │
│   ┌──────────────────┐          │                       │               │
│   │   Keycloak       │          │  MinIO / S3           │               │
│   │   (OIDC/SAML)    │          │  (Reports/Artifacts) │               │
│   └──────────────────┘          └───────────────────────┘               │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │  Observability Stack                                              │  │
│   │  Prometheus · Grafana · Jaeger · Structured Logs (ES)            │  │
│   └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Service Architecture — Detailed

### 4.1 API Gateway (`acis-gateway` — port 8080)

**Technology:** Spring Cloud Gateway 4.x + Spring Security  
**Responsibilities:**
- Single ingress point for all frontend and API calls
- JWT token validation against Keycloak JWKS endpoint
- Tenant extraction from JWT claims → inject `X-Tenant-ID` header
- Rate limiting: 1,000 req/min per tenant (Redis token bucket)
- CORS policy for frontend origin
- Circuit breaker (Resilience4j) per downstream service

**Route Table:**

| Path Prefix | Downstream Service | Port |
|---|---|---|
| `/api/dashboard/**` | acis-alerts | 8081 |
| `/api/search/**` | acis-search | 8082 |
| `/api/correlation/**` | acis-correlation | 8083 |
| `/api/ingest/**` | acis-ingestion | 8084 |
| `/api/soar/**` | acis-soar | 8085 |
| `/api/assets/**` | acis-assets | 8086 |
| `/api/threat-intel/**` | acis-threat-intel | 8087 |
| `/api/reports/**` | acis-reports | 8088 |
| `/api/red-team/**` | acis-soar | 8085 |

---

### 4.2 Ingestion Service (`acis-ingestion` — port 8084)

**Technology:** Spring Boot 3.x + Apache Kafka Producer  
**Responsibilities:**
- Accepts raw log data: Syslog, CEF (Common Event Format), LEEF, JSON arrays
- Normalises all formats into the ACIS Common Event Schema (OCSF-inspired)
- Publishes to Kafka topic `acis.raw.events` with tenant partition key
- Failed normalisation → Dead Letter Queue `acis.dlq.events`

**Common Event Schema (OCSF-Inspired):**
```json
{
  "event_id":    "uuid-v4",
  "tenant_id":   "uuid",
  "timestamp":   "2026-05-29T05:00:00Z",
  "source_type": "firewall|endpoint|cloud|email|proxy|edr",
  "src_ip":      "192.168.1.100",
  "dest_ip":     "10.0.0.1",
  "user":        "john.doe@acme.com",
  "action":      "BLOCKED|ALLOWED|FAILED|SUCCEEDED",
  "severity":    "critical|high|medium|low|info",
  "raw":         "<original log line>",
  "tags":        ["auth-failure", "admin-account"]
}
```

---

### 4.3 Search Service (`acis-search` — port 8082)

**Technology:** Spring Boot 3.x + Elasticsearch Java Client  
**Responsibilities:**
- Kafka Consumer: `acis.raw.events` → transform → index to Elasticsearch
- Index naming: `acis-events-{tenant}-{YYYY.MM.dd}`
- SPL query parser: translates Splunk-like syntax to Elasticsearch DSL
- Saved search management (PostgreSQL)
- Paginated search results (server-side, 100 rows/page)

**Supported SPL Operators:**
- `index=<name>`, `sourcetype=<type>`, field filters (`src_ip=`, `user=`)
- `| stats count by <field>`
- `| sort -<field>` / `| sort <field>`
- `| head <N>`
- Date range filters (`earliest=`, `latest=`)

---

### 4.4 Correlation Engine (`acis-correlation` — port 8083)

**Technology:** Spring Boot 3.x + Apache Flink 1.18  
**Responsibilities:**
- Manages correlation rules (CRUD) stored in PostgreSQL
- For each enabled rule, submits a Flink streaming job
- Flink jobs apply windowed CEP over `acis.normalized.events`
- On rule match → produce alert to `acis.alerts` Kafka topic

**Supported Rule Types:**

| Rule Type | Description | Example |
|---|---|---|
| **Threshold** | N events in T minutes | >5 failed logins in 5 min |
| **Sequence** | Event A followed by Event B within T | Login from new country then admin access |
| **Statistical** | Stddev deviation from learned baseline | 3σ deviation in outbound bytes |

**Pre-seeded Rules:**
1. Impossible Travel — geo-distance between logins > 1000 km in < 60 min
2. Privilege Escalation on DC — user context escalation pattern on domain controller
3. Excessive 401 Failures — >10 authentication failures in 5 minutes per user
4. Suspicious ASR Bypass — Windows ASR rule bypass pattern detected

---

### 4.5 Alerts & Incidents Service (`acis-alerts` — port 8081)

**Technology:** Spring Boot 3.x + Spring WebSocket (STOMP)  
**Responsibilities:**
- Kafka Consumer: `acis.alerts` → persist to PostgreSQL
- Deduplication: identical alerts within 5 minutes are merged
- Alert promotion to Incidents
- WebSocket push to connected clients: `/topic/alerts`, `/topic/dashboard`
- Dashboard KPI aggregation: events/24h, MTTD, MTTR, open incidents
- Endpoint health status management (for Phase 5 self-healing)

**Alert Lifecycle:**
```
OPEN → INVESTIGATING → MITIGATED → CLOSED
         ↓
    (promote to INCIDENT)
         ↓
    INC-XXXX created
```

---

### 4.6 SOAR Service (`acis-soar` — port 8085)

**Technology:** Spring Boot 3.x + Spring `@Async` executor  
**Responsibilities:**
- Playbook definition storage (JSON step definitions in PostgreSQL)
- Async playbook execution engine (step-by-step, sequential)
- Red Team simulation management and runner
- Integration connectors: HTTP webhook, Microsoft 365 (mock), Okta (mock)

**Playbook Step Types:**
- `isolate_endpoint` — calls asset service to quarantine endpoint
- `block_ip` — calls firewall integration
- `block_domain` — proxy + firewall block
- `reset_credentials` — Okta/M365 password reset
- `run_script` — arbitrary script execution via agent
- `send_notification` — email/Slack/Teams
- `call_webhook` — generic HTTP webhook

**Playbook Execution Model:**
```
Execute Request
    → Create Execution Record (status: RUNNING)
    → Step 1 → log result → Step 2 → log result → ...
    → Update status: COMPLETED | FAILED
    → WebSocket push: /topic/soar-execution/{id}
```

**Red Team Simulation Model:**
- Each simulation has N stages mapped to MITRE ATT&CK techniques
- Simulation runner cycles through stages with configurable delay
- Each stage produces synthetic detection events to Kafka
- Detection events surface as real alerts in the alerts module

---

### 4.7 Assets Service (`acis-assets` — port 8086)

**Technology:** Spring Boot 3.x + Spring Data JPA  
**Asset Model:**

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | Tenant isolation |
| `name` | VARCHAR | Asset display name |
| `type` | VARCHAR | SERVER, WORKSTATION, FIREWALL, CLOUD, NETWORK |
| `owner` | VARCHAR | Owner name or email |
| `criticality` | VARCHAR | HIGH, MEDIUM, LOW |
| `tags` | TEXT[] | Tag array |
| `ip_addresses` | TEXT[] | IP array |
| `status` | VARCHAR | ACTIVE, INACTIVE, QUARANTINED |
| `health` | VARCHAR | OK, DEGRADED, QUARANTINED |
| `isolated` | BOOLEAN | Endpoint isolation flag |
| `last_seen` | TIMESTAMPTZ | Last telemetry timestamp |

**Self-Healing Integration:**
The Endpoints & Network module (`/dashboard/endpoints`) calls `PUT /api/assets/{id}/status` to:
- **Isolate**: set `status=QUARANTINED, isolated=true` → triggers agent to cut network
- **Rollback**: set `status=ACTIVE, health=OK, isolated=false` → restore from snapshot

---

### 4.8 Threat Intelligence Service (`acis-threat-intel` — port 8087)

**Technology:** Spring Boot 3.x + gRPC client to AI service  
**Responsibilities:**
- IOC enrichment: IP/domain/hash lookup via Python AI service
- 24-hour enrichment result cache (PostgreSQL `ioc_cache` table)
- Community swarm signals feed (anonymized, federated IOC sharing)
- Produces enriched events to `acis.enriched.events` Kafka topic

---

### 4.9 AI / ML Service (`ai-service` — port 8090)

**Technology:** Python 3.11 + FastAPI + LangChain + scikit-learn + PyTorch  
**Communication:** gRPC from Java services, REST for internal use

**ML Models:**

| Model | Algorithm | Purpose |
|---|---|---|
| Anomaly Detector | Isolation Forest (scikit-learn) | Detect unusual event patterns |
| Threat Classifier | XGBoost | Classify: malware/exfil/lateral/phishing/privesc |
| MITRE Mapper | FAISS Vector Index + OpenAI Embeddings | Map event to ATT&CK technique |

**LangChain Chains:**

| Chain | Input | Output |
|---|---|---|
| `explain_alert` | Alert JSON | Plain-English analyst briefing + recommended action |
| `nl_to_spl` | Natural language query | Valid SPL query string |
| `ioc_enrich` | IP / domain / hash | Threat profile, verdict, campaign links |

**API Endpoints:**
```
POST /ai/enrich      — IOC enrichment with LLM summary
POST /ai/query       — NL → SPL translation
POST /ai/explain     — Alert explanation in plain English
POST /ai/anomaly     — Isolation Forest anomaly score
POST /ai/classify    — XGBoost threat classification
POST /ai/mitre       — MITRE ATT&CK technique mapping
POST /ai/risk-score  — Composite risk score (0–100)
GET  /ai/health      — Service health check
```

---

### 4.10 Reports Service (`acis-reports` — port 8088)

**Technology:** Spring Boot 3.x + Apache POI (PPTX) + iText (PDF)  
**Report Templates:**
- `executive_summary` — Weekly overview PDF for CISOs
- `incident_board` — Incident details PPTX for board presentations
- `detection_coverage` — Detection rule coverage CSV for engineers
- `compliance_posture` — NIS2/GDPR/ISO 27001 status PDF

---

## 5. Data Flow Architecture

### 5.1 Security Event Ingest & Detection Flow

```
External Source (EDR/Firewall/Cloud)
    │
    │ POST /api/ingest/syslog  (or /json)
    ▼
acis-ingestion
    │ Normalize → OCSF Schema
    │ Kafka.produce("acis.raw.events", tenantKey)
    ▼
Apache Kafka [acis.raw.events]
    │
    ├──► acis-search Consumer
    │        └─ Index to Elasticsearch [acis-events-{tenant}-{date}]
    │
    └──► Apache Flink CEP Jobs
             │ Apply correlation rules (windowed CEP)
             │ On match: produce alert
             ▼
         Apache Kafka [acis.alerts]
             │
             ▼
         acis-alerts Consumer
             │ Persist to PostgreSQL
             │ Deduplicate (5 min window)
             │ WebSocket push → /topic/alerts
             ▼
         React Frontend (live alert appears)
```

### 5.2 SOAR Execution Flow

```
Analyst clicks "Run Playbook" in UI
    │
    │ POST /api/soar/playbooks/{id}/execute
    ▼
acis-soar
    │ Create PlaybookExecution record (status: RUNNING)
    │ Async executor starts
    ▼
Step 1: isolate_endpoint
    │ PUT /api/assets/{assetId}/status → QUARANTINED
    │ Log: {step: 1, status: SUCCESS, ts: ...}
    ▼
Step 2: block_domain
    │ POST firewall webhook
    │ Log: {step: 2, status: SUCCESS, ts: ...}
    ▼
Step 3: send_notification
    │ POST /email/send
    │ Log: {step: 3, status: SUCCESS, ts: ...}
    ▼
Execution COMPLETED
    │ Update playbook: success_count++
    │ WebSocket push → /topic/soar-execution/{id}
    ▼
UI live execution log updates in real-time
```

### 5.3 Red Team Simulation Flow

```
Analyst clicks "INITIATE ATTACK"
    │
    │ POST /api/red-team/simulations/{id}/start
    ▼
acis-soar (Red Team Runner)
    │ Create SimulationRun record
    │ Async: iterate through stages with delay
    ▼
Stage 1: Phishing → Initial Access (T1566.001)
    │ Produce synthetic event to Kafka [acis.raw.events]
    │ Event: { source_type: email, action: PHISHING_CLICKED }
    ▼
Stage 2: Execution (T1059 — PowerShell)
    │ Produce: { source_type: endpoint, action: SUSPICIOUS_POWERSHELL }
    ▼
Stage 3: Lateral Movement (T1021)
    │ Produce: { source_type: edr, action: LATERAL_MOVEMENT }
    ▼
Flink CEP detects pattern → Alert fires
    │ Alert appears live on dashboard
    ▼
Detection Coverage Report: 3/3 techniques covered ✓
```

### 5.4 IOC Enrichment Flow

```
Analyst pastes IP/Hash/Domain in Threat Intel panel
    │
    │ POST /api/threat-intel/enrich  { indicator, type }
    ▼
acis-threat-intel
    │ Check PostgreSQL cache (TTL: 24h)
    │ Cache HIT → return cached enrichment
    │ Cache MISS → call AI service via gRPC
    ▼
ai-service: POST /ai/enrich
    │ LangChain ioc_enrich chain
    │ · OpenAI Embeddings similarity search
    │ · VirusTotal/AbuseIPDB context lookup
    │ · LLM summary generation (GPT-4o)
    ▼
Return: { verdict, risk_score, sources, campaigns, llm_summary }
    │
    ▼
Cache result in PostgreSQL
    │
    ▼
Display in UI: verdict badge, risk score, LLM explanation
```

---

## 6. Multi-Tenancy Architecture

### 6.1 Tenant Isolation Model

| Layer | Isolation Mechanism |
|---|---|
| **API Gateway** | JWT claims extraction → inject `X-Tenant-ID` header |
| **Spring Boot Services** | `TenantContext` `@RequestScope` bean; all JPA queries scoped by `tenant_id` |
| **PostgreSQL** | Row Level Security (RLS) policies enforce `tenant_id` filter at DB level |
| **Elasticsearch** | Separate index per tenant: `acis-events-{tenant}-{date}` |
| **Kafka** | Tenant ID as partition key; consumer groups per service (not per tenant) |
| **MinIO** | Separate bucket prefix per tenant: `acis-reports/{tenant_slug}/` |

### 6.2 JWT Claim Structure

```json
{
  "sub": "user-uuid",
  "tenant_id": "acme-uuid",
  "tenant_slug": "acme",
  "roles": ["analyst"],
  "email": "analyst1@acme.com",
  "iat": 1748486400,
  "exp": 1748490000,
  "iss": "http://keycloak:8080/realms/acis"
}
```

---

## 7. Security Architecture

### 7.1 Authentication & Authorisation

| Component | Technology | Notes |
|---|---|---|
| **Identity Provider** | Keycloak 24.x | OIDC + SAML 2.0 support |
| **Token Format** | JWT (RS256 signed) | Keycloak realm key |
| **Token Storage** | httpOnly Cookie | XSS-resistant |
| **RBAC Roles** | viewer / analyst / engineer / admin | Enforced at gateway + service layer |
| **Session Expiry** | 60 minutes (configurable) | Refresh token: 8 hours |

### 7.2 Role Permission Matrix

| Capability | Viewer | Analyst | Engineer | Admin |
|---|---|---|---|---|
| View Dashboard | ✓ | ✓ | ✓ | ✓ |
| View Alerts | ✓ | ✓ | ✓ | ✓ |
| Assign Alerts | — | ✓ | ✓ | ✓ |
| Run Playbooks | — | ✓ | ✓ | ✓ |
| Create/Edit Rules | — | — | ✓ | ✓ |
| Run Red Team | — | — | ✓ | ✓ |
| Manage Settings | — | — | — | ✓ |
| Manage API Keys | — | — | — | ✓ |
| Manage RBAC | — | — | — | ✓ |

### 7.3 Network Security

- All inter-service communication: TLS 1.3 (K8s production)
- Kubernetes NetworkPolicies: services only accept traffic from known peers
- Secrets managed via Kubernetes Secrets (mounted as env vars)
- Keycloak client secrets rotated per environment
- No secrets in source code; `.env.example` contains only placeholders

---

## 8. Observability Architecture

### 8.1 Metrics (Prometheus + Grafana)

| Service | Key Metrics |
|---|---|
| acis-gateway | Request rate, latency p95/p99, error rate, active connections |
| acis-ingestion | Events ingested/sec, normalisation failure rate, Kafka lag |
| acis-correlation | Flink job health, rules evaluated/sec, alerts fired/sec |
| acis-alerts | Alert creation rate, dedup rate, open alert count by severity |
| acis-soar | Playbook execution rate, step failure rate, execution duration |
| ai-service | Inference latency, model accuracy, LLM call duration |
| Kafka | Consumer lag per topic, throughput, partition distribution |

### 8.2 Distributed Tracing (Jaeger)

- Trace ID injected at gateway: `X-Trace-ID` header propagated to all downstream services
- Spring Boot services: Micrometer + OpenTelemetry SDK
- Python AI service: OpenTelemetry Python SDK
- Trace storage: Jaeger backend (Elasticsearch)
- Sample rate: 100% in dev, 10% in prod (configurable)

### 8.3 Structured Logging

All services emit structured JSON logs:
```json
{
  "timestamp": "2026-05-29T05:00:00.000Z",
  "level": "INFO",
  "service": "acis-alerts",
  "tenant_id": "acme-uuid",
  "trace_id": "abc123",
  "message": "Alert created: AL-0042",
  "alert_id": "AL-0042",
  "severity": "HIGH"
}
```

---

## 9. Technology Stack Reference

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend** | React.js | 18.x | SPA framework |
| **Build Tool** | Vite | 5.x | Dev server + bundler |
| **State** | Zustand | 4.x | Global state management |
| **Routing** | React Router | v6 | Client-side routing |
| **Charts** | Recharts | 2.x | Area, Bar, Pie, Line charts |
| **Data Grid** | AG Grid | 31.x | Virtualised table (millions of rows) |
| **Visualisation** | D3.js | 7.x | Custom SVG visualisations |
| **Styling** | Tailwind CSS | 3.x | Utility-first CSS |
| **Components** | shadcn/ui | Latest | Radix-based UI components |
| **Backend** | Java | 21 (LTS) | Backend language |
| **Framework** | Spring Boot | 3.2.x | Backend framework |
| **Build** | Maven | 3.9.x | Multi-module build |
| **Auth** | Keycloak | 24.x | OIDC / SAML IdP |
| **Gateway** | Spring Cloud Gateway | 4.x | API gateway |
| **Broker** | Apache Kafka | 3.7.x (KRaft) | Event streaming |
| **Stream** | Apache Flink | 1.18.x | Stateful CEP |
| **Hot Storage** | Elasticsearch | 8.13.x | Event search index |
| **Warm Storage** | ClickHouse | 24.3 | Time-series analytics |
| **Cold Storage** | PostgreSQL | 16 | Relational metadata |
| **Object Store** | MinIO | Latest | S3-compatible reports |
| **AI Framework** | FastAPI | 0.111.x | Python AI service |
| **ML** | scikit-learn + PyTorch | Latest | Anomaly + classification models |
| **LLM** | LangChain + GPT-4o | Latest | NLP chains |
| **Vector DB** | FAISS | 1.8.x | MITRE ATT&CK embeddings |
| **Containers** | Docker | 26.x | Containerisation |
| **Orchestration** | Kubernetes | 1.29+ | Production orchestration |
| **Packaging** | Helm | 3.x | K8s chart management |
| **CI/CD** | GitHub Actions | Latest | Pipeline automation |
| **Metrics** | Prometheus + Grafana | Latest | Observability |
| **Tracing** | Jaeger | 1.57 | Distributed tracing |
| **Real-time** | Spring WebSocket (STOMP) | 3.x | Live alert push |

---

## 10. API Design Standards

### 10.1 Response Envelope

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "timestamp": "2026-05-29T05:00:00Z"
}
```

**Error Response:**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERR_ALERT_NOT_FOUND",
    "message": "Alert AL-9999 does not exist for this tenant"
  },
  "timestamp": "2026-05-29T05:00:00Z"
}
```

### 10.2 Pagination Standard

```
GET /api/alerts?page=0&size=20&sort=createdAt,desc
```

Response includes:
```json
{
  "data": {
    "content": [...],
    "totalElements": 1500,
    "totalPages": 75,
    "page": 0,
    "size": 20
  }
}
```

### 10.3 Required Headers

| Header | Source | Required |
|---|---|---|
| `Authorization: Bearer {jwt}` | Keycloak | ✓ (all endpoints) |
| `X-Tenant-ID` | Gateway (injected) | ✓ (all endpoints) |
| `Content-Type: application/json` | Client | ✓ (POST/PUT) |

---

*Document Version 1.0 — NETCRADUS ACIS Engineering*
