# NETCRADUS ACIS — Phase Coverage Report & Tech Stack Breakdown

**Document Version:** 1.0  
**Date:** May 2026  
**Classification:** Internal — Engineering / Management  
**Author:** Kumar Ujjwal  
**Purpose:** Comprehensive record of what has been built, verified, and delivered across all phases  

---

## 1. Executive Summary

The NETCRADUS ACIS platform has been built across a structured 7-phase delivery plan. This document records the **completion status, deliverables, and technology decisions** for each phase, with particular depth on the currently active **Phase 5 — SOAR, Red Team & Endpoints**.

### 1.1 Overall Progress Dashboard

```
Phase 1 — Foundation & Auth          ██████████ 100% ✅ COMPLETE
Phase 2 — Log Ingestion Pipeline     ██████████ 100% ✅ COMPLETE
Phase 3 — Correlation Engine & Alerts██████████ 100% ✅ COMPLETE
Phase 4 — AI / ML Service            ██████████ 100% ✅ COMPLETE
Phase 5 — SOAR, Red Team & Endpoints ████████░░  90% 🔵 IN PROGRESS
Phase 6 — Compliance, Reports, Settings███░░░░░░  30% 🟡 SCAFFOLDED
Phase 7 — Production Hardening & K8s ░░░░░░░░░░   0% ⬜ PLANNED
```

---

## 2. Phase 1 — Foundation & Auth

**Goal:** Working monorepo, Docker Compose up, login flow end-to-end  
**Status:** ✅ **COMPLETE**  
**Sprint Duration:** Week 1–2  

### 2.1 Deliverables

| Task | Status | Notes |
|---|---|---|
| Scaffold monorepo structure | ✅ | `netcradus-acis/` with frontend/, backend/, ai-service/, infra/ |
| `docker-compose.yml` with all infra | ✅ | Postgres, Kafka, ES, Keycloak, MinIO, Prometheus, Grafana |
| Keycloak realm `acis` config | ✅ | `infra/keycloak/realm-acis.json` — client + roles |
| `acis-gateway` Spring Cloud Gateway | ✅ | JWT validation, routing, rate limiting, CORS |
| React app shell (Vite + TS + Tailwind) | ✅ | Dark theme `#0D1B3E` bg, purple/pink accent |
| Login module | ✅ | Email+password form, SSO button, JWT cookie |
| Persistent left sidebar | ✅ | 13 module nav links, icons, active state |
| Top bar | ✅ | Global search, notification bell, user avatar, logout |
| Protected route wrapper | ✅ | `<PrivateRoute>` redirects unauthenticated users |
| `README.md` | ✅ | Setup instructions, prerequisites, start commands |

### 2.2 Key Technology Decisions (Phase 1)

| Decision | Rationale |
|---|---|
| **Vite over Create React App** | 10x faster HMR, native ESM, better production bundling |
| **Zustand over Redux** | Minimal boilerplate, hook-based, no context wrapping |
| **Keycloak over Auth0** | Self-hostable, SAML 2.0 support, no per-MAU pricing |
| **Spring Cloud Gateway** | Native Spring ecosystem, reactive, supports JWT validation out-of-box |
| **KRaft mode Kafka** | Eliminates ZooKeeper dependency, single process, simpler ops |
| **Tailwind CSS + shadcn/ui** | Rapid design-system-consistent component development |

### 2.3 Acceptance Criteria — Verified

```
✅ docker compose up → all infrastructure starts without errors
✅ Navigate to localhost:3000 → login page renders
✅ Login with admin credentials → redirect to dashboard
✅ Sidebar shows all 13 module links
✅ Logout → redirect to /login
✅ Direct URL access without login → redirect to /login
```

---

## 3. Phase 2 — Log Ingestion Pipeline

**Goal:** Events flow from ingest API → Kafka → Elasticsearch → searchable  
**Status:** ✅ **COMPLETE**  
**Sprint Duration:** Week 3–4  

### 3.1 Deliverables

| Task | Status | Notes |
|---|---|---|
| `acis-ingestion` service | ✅ | Syslog/JSON intake, OCSF normalisation, Kafka producer |
| Common Event Schema (DTO) | ✅ | OCSF-inspired 11-field schema |
| Kafka producer setup | ✅ | `acis.raw.events` topic, tenant partition key |
| Kafka consumer in `acis-search` | ✅ | Consumes → transforms → indexes to ES |
| Elasticsearch index template | ✅ | `acis-events-{tenant}-{YYYY.MM.dd}`, field mappings |
| SPL query parser | ✅ | index, sourcetype, field filters, stats, sort, head |
| Search query API | ✅ | `POST /api/search/query` → ES DSL → paginated |
| Log Explorer React module | ✅ | Monaco editor, Event Trend chart, AG Grid table |
| Export CSV | ✅ | Full result set download |
| Save Search | ✅ | Named search persistence |
| Seed script (10K events) | ✅ | `scripts/seed-kafka.py` — synthetic event generator |

### 3.2 Common Event Schema

```java
// acis-common/src/main/java/com/netcradus/acis/common/dto/EventDTO.java
public record EventDTO(
    String eventId,      // UUID v4
    String tenantId,     // UUID
    String timestamp,    // ISO 8601
    String sourceType,   // firewall|endpoint|cloud|email|proxy|edr
    String srcIp,
    String destIp,
    String user,
    String action,       // BLOCKED|ALLOWED|FAILED|SUCCEEDED
    String severity,     // critical|high|medium|low|info
    String raw,          // original log line
    List<String> tags
) {}
```

### 3.3 Elasticsearch Index Mapping

```json
{
  "mappings": {
    "properties": {
      "event_id":    { "type": "keyword" },
      "tenant_id":   { "type": "keyword" },
      "timestamp":   { "type": "date" },
      "source_type": { "type": "keyword" },
      "src_ip":      { "type": "ip" },
      "dest_ip":     { "type": "ip" },
      "user":        { "type": "keyword" },
      "action":      { "type": "keyword" },
      "severity":    { "type": "keyword" },
      "raw":         { "type": "text", "index": false }
    }
  },
  "settings": {
    "number_of_shards":   3,
    "number_of_replicas": 1,
    "refresh_interval":   "5s"
  }
}
```

### 3.4 Acceptance Criteria — Verified

```
✅ POST /api/ingest/json with 100 events → all indexed in Elasticsearch
✅ Log Explorer: run SPL query → results appear in AG Grid table
✅ Pagination: next page loads next 100 rows
✅ Export CSV: downloads all matching rows
✅ Save Search: named search persists and reloads
✅ 10,000 seed events visible in Log Explorer
```

---

## 4. Phase 3 — Correlation Engine & Alerts

**Goal:** Rules fire automatically, alerts appear in real-time on frontend  
**Status:** ✅ **COMPLETE**  
**Sprint Duration:** Week 5–7  

### 4.1 Deliverables

| Task | Status | Notes |
|---|---|---|
| `acis-correlation` service | ✅ | Rule CRUD, Flink job manager |
| Apache Flink integration | ✅ | Per-rule CEP jobs, sliding window, 3 rule types |
| `acis.alerts` Kafka topic | ✅ | Alert events produced by Flink on rule match |
| `acis-alerts` service | ✅ | Consumes alerts, persists, deduplicates |
| WebSocket push | ✅ | STOMP `/topic/alerts`, `/topic/dashboard` |
| Dashboard module | ✅ | KPI cards, AreaChart, DonutChart, Open Incidents table |
| Correlation Searches module | ✅ | Rule list, enable/disable, New Rule modal |
| Alerts & Incidents module | ✅ | Dual-tab, severity badges, actions, detail drawer |
| 4 default correlation rules | ✅ | Seeded via `scripts/seed.sql` |

### 4.2 Flink CEP Architecture

```
DataStream<EventDTO> stream = env
    .addSource(new FlinkKafkaConsumer<>(
        "acis.raw.events",
        new EventDTOSchema(),
        kafkaProps
    ))
    .filter(e -> e.getTenantId().equals(rule.getTenantId()));

// Threshold rule: N events in T minutes
Pattern<EventDTO, ?> pattern = Pattern.<EventDTO>begin("events")
    .where(new EventCondition(rule))
    .timesOrMore(rule.getThreshold())
    .within(Time.minutes(rule.getWindowMinutes()));

CEP.pattern(stream, pattern)
    .select(matches -> AlertDTO.fromMatches(rule, matches))
    .addSink(new FlinkKafkaProducer<>("acis.alerts", ...));
```

### 4.3 Alert Deduplication Logic

```
Incoming alert fingerprint = hash(tenant_id + correlation_rule_id + severity + title)
If fingerprint seen within last 5 minutes:
    → Merge (update timestamp, increment count)
Else:
    → Create new alert record
    → Push to WebSocket
```

### 4.4 Pre-seeded Correlation Rules

| Rule Name | Type | Condition | Risk Score |
|---|---|---|---|
| Impossible Travel | Sequence | Login from 2 countries >1000km apart in <60min | 95 |
| Privilege Escalation on DC | Threshold | Admin context gained on domain controller | 90 |
| Excessive 401 Failures | Threshold | >10 auth failures per user in 5 min | 75 |
| Suspicious ASR Bypass | Statistical | Windows ASR rule circumvented | 85 |

### 4.5 Acceptance Criteria — Verified

```
✅ Enable correlation rule → Flink job starts
✅ Push matching events via seed script → alert created in DB
✅ Alert appears on dashboard via WebSocket within 1 second
✅ Duplicate alert within 5 min → merged, not duplicated
✅ Alert promoted to incident → INC-XXXX created
✅ Alert assigned to analyst → owner field updated
✅ Dashboard KPI cards show live counts
```

---

## 5. Phase 4 — AI / ML Service

**Goal:** Anomaly detection, threat classification, and LLM features working  
**Status:** ✅ **COMPLETE**  
**Sprint Duration:** Week 8–10  

### 5.1 Deliverables

| Task | Status | Notes |
|---|---|---|
| Python FastAPI service scaffold | ✅ | All route stubs with Pydantic v2 schemas |
| IsolationForest anomaly detection | ✅ | 5 features, synthetic training data |
| XGBoostClassifier threat classification | ✅ | 6 classes, confidence output |
| MITRE ATT&CK mapper | ✅ | FAISS vector index, OpenAI embeddings |
| LangChain chains | ✅ | explain_alert, nl_to_spl, ioc_enrich |
| gRPC proto definition | ✅ | Spring Boot ↔ Python AI communication |
| `acis-threat-intel` service | ✅ | IOC enrichment via gRPC to AI service |
| Threat Intel Swarm module | ✅ | Enrichment panel, signals feed |
| "Explain this alert" button | ✅ | Alert drawer → LLM plain-English explanation |
| NL→SPL in Log Explorer | ✅ | "Translate to SPL" button |

### 5.2 ML Model Specifications

**Isolation Forest (Anomaly Detection):**
```python
from sklearn.ensemble import IsolationForest

model = IsolationForest(
    n_estimators=100,
    contamination=0.05,   # 5% expected anomaly rate
    random_state=42
)

# Features (normalised):
features = [
    event_frequency_per_user_per_hour,
    login_time_deviation_from_baseline,
    geo_distance_km_between_consecutive_logins,
    bytes_transferred_zscore,
    failed_auth_ratio_last_hour
]

# Output:
# anomaly_score: float 0.0–1.0 (higher = more anomalous)
# is_anomaly: bool (score > 0.75)
# top_features: list of contributing features
```

**XGBoost Classifier (Threat Classification):**
```python
import xgboost as xgb

model = xgb.XGBClassifier(
    n_estimators=300,
    max_depth=6,
    learning_rate=0.1,
    objective='multi:softprob',
    num_class=6
)

# Classes:
CLASSES = ['malware', 'exfiltration', 'lateral_movement',
           'phishing', 'privilege_escalation', 'benign']

# Features:
features = [
    event_type_encoded,
    source_type_encoded,
    hour_of_day,
    is_admin_account,
    outbound_bytes_mb,
    user_agent_entropy,
    failed_auth_precedes,
    destination_is_internal
]

# Output:
# predicted_class: str
# confidence: float 0.0–1.0
# probabilities: { class: prob for each class }
```

**MITRE ATT&CK FAISS Index:**
```python
import faiss
from openai import OpenAI

# At startup: build FAISS index from MITRE ATT&CK techniques
# Load STIX JSON from https://github.com/mitre/cti
# Embed each technique description with text-embedding-ada-002
# Store in FAISS IndexFlatIP (inner product / cosine similarity)

# At query time:
def mitre_map(event_description: str) -> MitreResult:
    query_embedding = openai.embed(event_description)
    distances, indices = faiss_index.search(query_embedding, k=1)
    technique = techniques[indices[0][0]]
    return MitreResult(
        technique_id=technique.id,       # e.g. "T1566.001"
        technique_name=technique.name,   # "Spearphishing Attachment"
        tactic=technique.tactic,         # "initial-access"
        similarity_score=distances[0][0]
    )
```

### 5.3 LangChain Chain Implementations

**explain_alert chain:**
```python
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser

explain_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a senior SOC analyst. Analyse this security alert and provide: "
               "1) Plain English explanation for non-technical stakeholders "
               "2) Technical root cause assessment "
               "3) Recommended immediate action "
               "4) Risk if unaddressed"),
    ("human", "Alert JSON: {alert_json}")
])

chain = explain_prompt | ChatOpenAI(model="gpt-4o") | PydanticOutputParser(pydantic_object=ExplainResponse)
```

**nl_to_spl chain:**
```python
nl_to_spl_prompt = ChatPromptTemplate.from_messages([
    ("system", "Convert the natural language security query to Splunk SPL syntax. "
               "Available fields: index, sourcetype, src_ip, dest_ip, user, action, severity, timestamp. "
               "Return ONLY the SPL query, no explanation."),
    ("human", "{natural_language_query}")
])

chain = nl_to_spl_prompt | ChatOpenAI(model="gpt-4o", temperature=0) | StrOutputParser()
```

### 5.4 Acceptance Criteria — Verified

```
✅ POST /ai/anomaly with event features → returns anomaly_score + is_anomaly
✅ POST /ai/classify with event → returns predicted_class + confidence
✅ POST /ai/mitre with description → returns ATT&CK technique_id
✅ POST /api/threat-intel/enrich with IP → LLM summary + risk score
✅ "Explain" button in alert drawer → renders plain-English explanation
✅ "Translate to SPL" in Log Explorer → valid SPL inserted in query bar
✅ gRPC channel: Spring Boot → Python AI service communication working
```

---

## 6. Phase 5 — SOAR, Red Team & Endpoints

**Goal:** Playbook execution, red team simulations, endpoint self-healing UI  
**Status:** 🔵 **90% COMPLETE — ACTIVE PHASE**  
**Sprint Duration:** Week 11–13  

### 6.1 Deliverables

| Task | Status | Notes |
|---|---|---|
| `acis-soar` service — Playbook CRUD | ✅ | PostgreSQL storage, full REST API |
| `acis-soar` — Async execution engine | ✅ | `@Async` step runner, execution log |
| `acis-soar` — Red Team runner | ✅ | Simulation CRUD, staged runner |
| SOAR Playbooks module (React) | ✅ | Card grid, Run button, live execution polling |
| Red Team Simulator module (React) | ✅ | Simulation cards, MITRE badges, Initiate Attack |
| Endpoints & Network module (React) | ✅ | Table, health badges, Isolate/Rollback actions |
| Endpoint health WebSocket push | ✅ | Via acis-alerts WebSocket subscription |
| Seed 3 playbooks | ✅ | Isolate Endpoint, Reset Account, Block Domain |
| Seed 3 red team simulations | ✅ | Phishing→Access, Living-off-Land, DNS Exfil |
| Alert "Run Playbook" action | 🔵 | Playbook selector in alert actions dropdown |
| Playbook builder UI (New Playbook) | 🔵 | Step builder modal — in progress |
| Live WebSocket execution log | 🔵 | Real-time step updates during playbook run |

### 6.2 SOAR Service Architecture

```
acis-soar (port 8085)
├── PlaybookController.java
│   ├── GET  /api/soar/playbooks
│   ├── POST /api/soar/playbooks/{id}/execute
│   └── GET  /api/soar/executions/{id}
│
├── RedTeamController.java
│   ├── GET  /api/red-team/simulations
│   └── POST /api/red-team/simulations/{id}/start
│
├── PlaybookService.java
│   └── executePlaybook() — @Async, step-by-step
│
├── RedTeamService.java
│   └── runSimulation() — @Async, staged with delay
│
└── connectors/
    ├── WebhookConnector.java
    ├── M365Connector.java (mock)
    └── OktaConnector.java (mock)
```

### 6.3 Playbook Execution Engine

```java
@Async("soarExecutor")
public void executePlaybook(UUID executionId, UUID playbookId) {
    PlaybookExecution exec = executionRepo.findById(executionId).orElseThrow();
    List<PlaybookStep> steps = parseSteps(exec.getPlaybook().getSteps());

    for (int i = 0; i < steps.size(); i++) {
        PlaybookStep step = steps.get(i);
        StepLog log = StepLog.builder()
            .stepIndex(i + 1)
            .stepType(step.getType())
            .startedAt(Instant.now())
            .build();

        try {
            executeStep(step);
            log.setStatus("SUCCESS");
            updatePlaybookSuccessCount(playbookId);
        } catch (Exception e) {
            log.setStatus("FAILED");
            log.setError(e.getMessage());
            if ("abort".equals(step.getOnFailure())) break;
        }

        log.setCompletedAt(Instant.now());
        appendStepLog(executionId, log);
    }

    exec.setStatus("COMPLETED");
    exec.setCompletedAt(Instant.now());
    executionRepo.save(exec);
}
```

### 6.4 Red Team Simulation Data Model

```json
{
  "id": "sim-phishing-001",
  "name": "Phishing → Initial Access",
  "description": "Simulates a targeted spearphishing campaign resulting in initial access",
  "mitreTechniques": ["T1566.001", "T1204.002"],
  "mitreTactics": ["initial-access", "execution"],
  "steps": [
    {
      "stage": 1,
      "name": "Send Phishing Email",
      "eventType": "email",
      "action": "PHISHING_SENT",
      "technique": "T1566.001",
      "delayMs": 2000
    },
    {
      "stage": 2,
      "name": "User Clicks Malicious Link",
      "eventType": "endpoint",
      "action": "MALICIOUS_LINK_CLICKED",
      "technique": "T1204.002",
      "delayMs": 3000
    },
    {
      "stage": 3,
      "name": "PowerShell Execution",
      "eventType": "edr",
      "action": "SUSPICIOUS_POWERSHELL",
      "technique": "T1059.001",
      "delayMs": 2000
    }
  ]
}
```

### 6.5 Endpoint Self-Healing Model

```
┌─────────────────────────────────────────────────────────┐
│              Self-Healing Lifecycle                      │
│                                                         │
│  ACTIVE → Alert: Malware Detected                       │
│     │                                                   │
│     │ (Auto: correlation rule fires → SOAR playbook)    │
│     ▼                                                   │
│  QUARANTINED (Isolated)                                 │
│     │ Network access cut at agent level                 │
│     │ Snapshot taken: disk state preserved              │
│     │                                                   │
│     │ (Analyst reviews in Endpoints module)             │
│     │                                                   │
│     ├──→ ROLLBACK to snapshot → ACTIVE (clean state)    │
│     │                                                   │
│     └──→ DECOMMISSION (major compromise)               │
└─────────────────────────────────────────────────────────┘
```

**API Endpoints for Endpoint Control:**
```
PUT /api/assets/{id}/status
Body: { "status": "QUARANTINED", "health": "QUARANTINED", "isolated": true }
→ Isolates endpoint

PUT /api/assets/{id}/status
Body: { "status": "ACTIVE", "health": "OK", "isolated": false }
→ Rollback endpoint
```

### 6.6 Frontend — Phase 5 Components

**SoarPage.tsx features:**
- Playbook card grid with colour-coded top border (green/amber/red per card)
- Success rate %, step count, run count per card
- `runPlaybook()` → `POST /api/soar/playbooks/{id}/execute`
- 5-second polling for live updates
- NEW PLAYBOOK button (builder UI in progress)

**RedTeamPage.tsx features:**
- Simulation cards with MITRE technique + tactic pill badges
- Skull icon watermark per card
- `startSimulation()` → `POST /api/red-team/simulations/{id}/start`
- "INITIATE ATTACK" button with danger styling
- Detection coverage stats post-simulation

**EndpointsPage.tsx features:**
- Full table: Name, Health badge, OS/IP, Isolation status, Actions
- `handleIsolate()` → `PUT /api/assets/{id}/status` → QUARANTINED
- `handleRollback()` → `PUT /api/assets/{id}/status` → ACTIVE
- ShieldCheck (green) / ShieldAlert (red) health icons
- Spinner during isolate action
- 5-second polling

### 6.7 Phase 5 — Acceptance Criteria

```
✅ GET /api/soar/playbooks → returns 3 seeded playbooks
✅ POST /api/soar/playbooks/{id}/execute → execution record created
✅ Execution steps logged: { step, status, ts } per step
✅ Playbook success_count increments on successful run
✅ GET /api/red-team/simulations → returns 3 seeded simulations
✅ POST /api/red-team/simulations/{id}/start → run_count increments
✅ GET /api/assets?type=WORKSTATION,SERVER → endpoints listed
✅ PUT /api/assets/{id}/status → status updated to QUARANTINED
✅ PUT /api/assets/{id}/status → rollback to ACTIVE
✅ Endpoints module shows correct health badge colours
🔵 Alert "Run Playbook" → opens playbook selector (in progress)
🔵 Live WebSocket execution log during playbook run (in progress)
```

---

## 7. Phase 6 — Compliance, Reports & Settings

**Goal:** Compliance posture display, downloadable reports, full RBAC settings  
**Status:** 🟡 **30% SCAFFOLDED**  
**Sprint Duration:** Week 14–16 (upcoming)  

### 7.1 Deliverables

| Task | Status | Notes |
|---|---|---|
| Compliance & Audit module (React) | 🟡 | UI scaffolded, data not wired |
| Compliance API | 🔲 | `GET /api/compliance/posture` — to build |
| `acis-reports` service | 🔲 | iText PDF + Apache POI PPTX — to build |
| Reports module (React) | 🟡 | UI scaffolded, download not wired |
| Settings module (React) | 🟡 | UI scaffolded, RBAC matrix visible |
| Settings API — RBAC | 🔲 | Role permission update API — to build |
| Settings API — API Keys | 🔲 | Key CRUD — to build |
| Audit log instrumentation | 🔲 | `AuditLogService.log()` in all services |
| Assets & Identities module | 🟡 | Built in Phase 3 (asset table functional) |

---

## 8. Phase 7 — Production Hardening & K8s

**Goal:** Production-ready deployment on Kubernetes  
**Status:** ⬜ **PLANNED**  
**Sprint Duration:** Week 17–20 (future)  

### 8.1 Planned Deliverables

| Task | Notes |
|---|---|
| Dockerfiles (multi-stage, non-root) | Per service |
| Kubernetes manifests | All 5 namespaces |
| Helm chart | Full platform chart |
| GitHub Actions CI/CD | Build → Test → Docker push → Helm deploy |
| Prometheus metrics (Micrometer) | All Spring Boot services |
| Grafana dashboards | 6 pre-built dashboards |
| Jaeger tracing | Trace IDs across all inter-service calls |
| TLS hardening | mTLS between services, K8s secrets |
| Multi-tenancy RLS validation | PostgreSQL RLS enforcement audit |
| Load test | 100K events/hour, sub-second query latency |

---

## 9. Technology Stack — Complete Reference

### 9.1 Frontend Stack

| Technology | Version | File(s) | Purpose |
|---|---|---|---|
| React | 18.x | `src/App.tsx` | SPA framework |
| TypeScript | 5.x | `tsconfig.json` | Type safety |
| Vite | 5.x | `vite.config.ts` | Build tool + dev server |
| React Router | v6 | `src/app/` | Client-side routing |
| Zustand | 4.x | `src/store/` | Global state (auth, alert, dashboard stores) |
| Tailwind CSS | 3.x | `tailwind.config.ts` | Utility-first styling |
| shadcn/ui | Latest | `src/components/` | Radix-based component library |
| Recharts | 2.x | modules/dashboard | Area, Bar, Pie charts |
| AG Grid | 31.x | modules/log-explorer | Virtualised data grid |
| Lucide React | Latest | All modules | Icon library |
| Axios | 1.x | `src/lib/apiClient.ts` | HTTP client with JWT interceptor |
| STOMP.js / SockJS | Latest | `src/lib/wsClient.ts` | WebSocket STOMP client |
| clsx | 2.x | All components | Conditional class name utility |

### 9.2 Backend Stack

| Technology | Version | Service(s) | Purpose |
|---|---|---|---|
| Java | 21 LTS | All Spring Boot | Language |
| Spring Boot | 3.2.x | All services | Framework |
| Spring Cloud Gateway | 4.x | acis-gateway | API gateway routing |
| Spring Security | 6.x | All services | OAuth2 JWT resource server |
| Spring Data JPA | 3.x | All services | ORM / database access |
| Spring WebSocket | 3.x | acis-alerts | STOMP WebSocket server |
| Spring Kafka | 3.x | acis-ingestion, acis-search, acis-alerts | Kafka producer/consumer |
| Apache Flink | 1.18.x | acis-correlation | Stream processing / CEP |
| Flyway | 9.x | All services | Database migration |
| Hibernate | 6.x | All services | JPA implementation |
| Jackson | 2.x | All services | JSON serialization |
| Lombok | 1.18.x | All services | Boilerplate reduction |
| MapStruct | 1.5.x | All services | DTO mapping |
| Micrometer | 1.12.x | All services | Metrics (Prometheus export) |
| OpenTelemetry | 1.x | All services | Distributed tracing |
| Maven | 3.9.x | Root pom.xml | Multi-module build |

### 9.3 Data Infrastructure Stack

| Technology | Version | Purpose | Port |
|---|---|---|---|
| PostgreSQL | 16 | Primary relational DB (metadata, alerts, rules) | 5432 |
| Elasticsearch | 8.13.x | Hot event storage, full-text search | 9200 |
| Apache Kafka | 3.7.x (KRaft) | Event streaming backbone | 9092 |
| Apache Flink | 1.18.x | Stateful stream processing + CEP | 8081 (Flink UI) |
| ClickHouse | 24.3 | Time-series analytics, warm storage | 8123, 9000 |
| MinIO | Latest | S3-compatible object storage (reports) | 9000, 9001 |
| Keycloak | 24.x | Identity Provider (OIDC/SAML) | 8180 |

### 9.4 AI / ML Stack

| Technology | Version | Purpose |
|---|---|---|
| Python | 3.11 | AI service language |
| FastAPI | 0.111.x | AI service REST API |
| Uvicorn | 0.29.x | ASGI server |
| Pydantic | v2 | Request/response schema validation |
| scikit-learn | 1.4.x | IsolationForest anomaly detection |
| XGBoost | 2.0.x | Threat classification |
| PyTorch | 2.2.x | Deep learning (future model training) |
| LangChain | 0.2.x | LLM chain orchestration |
| langchain-openai | Latest | GPT-4o integration |
| FAISS | 1.8.x | Vector similarity search (MITRE mapping) |
| grpcio | 1.64.x | gRPC server (AI ↔ Spring Boot) |
| Celery | 5.4.x | Background task queue (model retraining) |
| Redis | 7.x | Celery broker + result backend |
| pytest | 8.x | Unit testing |

### 9.5 Infrastructure & DevOps Stack

| Technology | Version | Purpose |
|---|---|---|
| Docker | 26.x | Container runtime |
| Docker Compose | 2.x | Development environment orchestration |
| Kubernetes | 1.29+ | Production container orchestration |
| Helm | 3.x | Kubernetes package management |
| GitHub Actions | Latest | CI/CD pipeline |
| Prometheus | 2.51.x | Metrics collection |
| Grafana | 10.4.x | Metrics visualisation + dashboards |
| Jaeger | 1.57.x | Distributed tracing |
| NGINX | Alpine | Frontend static file serving |
| cert-manager | 1.14.x | TLS certificate automation |
| Trivy | Latest | Container vulnerability scanning |

---

## 10. Database Schema — Complete ERD Summary

```
tenants (1)
    │
    ├── (M) users
    │       └── keycloak_id → Keycloak
    │
    ├── (M) alerts
    │       ├── owner_id → users
    │       ├── correlation_rule_id → correlation_rules
    │       └── (M-M) alert_incidents → incidents
    │
    ├── (M) incidents
    │       └── owner_id → users
    │
    ├── (M) correlation_rules
    │
    ├── (M) assets
    │       └── (M-M) asset_identities → users
    │
    ├── (M) playbooks
    │       └── (M) playbook_executions
    │               └── triggered_by → users
    │
    └── (M) audit_log
            └── user_id → users

ioc_cache (no tenant — global cache)
```

---

## 11. API Endpoint Inventory

### 11.1 Complete API Map

| Method | Path | Service | Phase | Status |
|---|---|---|---|---|
| `POST` | `/api/ingest/syslog` | acis-ingestion | 2 | ✅ |
| `POST` | `/api/ingest/json` | acis-ingestion | 2 | ✅ |
| `POST` | `/api/search/query` | acis-search | 2 | ✅ |
| `GET` | `/api/search/saved` | acis-search | 2 | ✅ |
| `POST` | `/api/search/saved` | acis-search | 2 | ✅ |
| `GET` | `/api/correlation/rules` | acis-correlation | 3 | ✅ |
| `POST` | `/api/correlation/rules` | acis-correlation | 3 | ✅ |
| `PUT` | `/api/correlation/rules/{id}/toggle` | acis-correlation | 3 | ✅ |
| `GET` | `/api/alerts` | acis-alerts | 3 | ✅ |
| `GET` | `/api/alerts/{id}` | acis-alerts | 3 | ✅ |
| `PUT` | `/api/alerts/{id}/assign` | acis-alerts | 3 | ✅ |
| `POST` | `/api/alerts/{id}/incident` | acis-alerts | 3 | ✅ |
| `GET` | `/api/dashboard/summary` | acis-alerts | 3 | ✅ |
| `POST` | `/api/threat-intel/enrich` | acis-threat-intel | 4 | ✅ |
| `GET` | `/api/threat-intel/swarm/signals` | acis-threat-intel | 4 | ✅ |
| `GET` | `/api/soar/playbooks` | acis-soar | 5 | ✅ |
| `POST` | `/api/soar/playbooks/{id}/execute` | acis-soar | 5 | ✅ |
| `GET` | `/api/soar/executions/{id}` | acis-soar | 5 | ✅ |
| `GET` | `/api/red-team/simulations` | acis-soar | 5 | ✅ |
| `POST` | `/api/red-team/simulations/{id}/start` | acis-soar | 5 | ✅ |
| `GET` | `/api/assets` | acis-assets | 3 | ✅ |
| `POST` | `/api/assets` | acis-assets | 3 | ✅ |
| `PUT` | `/api/assets/{id}` | acis-assets | 3 | ✅ |
| `PUT` | `/api/assets/{id}/status` | acis-assets | 5 | ✅ |
| `GET` | `/api/assets/{id}/alerts` | acis-assets | 3 | ✅ |
| `GET` | `/api/compliance/posture` | acis-alerts | 6 | 🔲 |
| `GET` | `/api/reports/generate` | acis-reports | 6 | 🔲 |
| `POST` | `/api/settings/rbac` | acis-alerts | 6 | 🔲 |
| `GET` | `/api/settings/api-keys` | acis-alerts | 6 | 🔲 |

### 11.2 AI Service API Map

| Method | Path | Phase | Status |
|---|---|---|---|
| `POST` | `/ai/enrich` | 4 | ✅ |
| `POST` | `/ai/query` | 4 | ✅ |
| `POST` | `/ai/explain` | 4 | ✅ |
| `POST` | `/ai/anomaly` | 4 | ✅ |
| `POST` | `/ai/classify` | 4 | ✅ |
| `POST` | `/ai/mitre` | 4 | ✅ |
| `POST` | `/ai/risk-score` | 4 | ✅ |
| `GET` | `/ai/health` | 4 | ✅ |

---

*Document Version 1.0 — NETCRADUS ACIS Engineering* 
