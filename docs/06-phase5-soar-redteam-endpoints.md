# NETCRADUS ACIS — Phase 5 Technical Deep Dive
## SOAR · Red Team Simulator · Endpoint Self-Healing

**Document Version:** 1.0  
**Date:** May 2026  
**Classification:** Internal — Engineering  
**Author:** Kumar Ujjwal  
**Phase Status:** 🔵 90% Complete — Active Sprint  

---

## 1. Phase 5 Overview

Phase 5 activates the **autonomous response and validation** layer of NETCRADUS ACIS. Where Phases 1–4 built the detection spine (ingest → correlate → alert → AI explain), Phase 5 closes the loop — the system doesn't just detect threats, it **responds, validates, and heals**.

### 1.1 Three Pillars of Phase 5

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  SOAR PLAYBOOKS  │   │  RED TEAM SIM    │   │  ENDPOINT HEAL   │
│                  │   │                  │   │                  │
│  Automate the    │   │  Validate your   │   │  Auto-isolate,   │
│  response to     │   │  defences before │   │  rollback, and   │
│  every incident  │   │  attackers do    │   │  repair endpoints│
│                  │   │                  │   │                  │
│  acis-soar       │   │  acis-soar       │   │  acis-assets     │
│  port 8085       │   │  port 8085       │   │  port 8086       │
│                  │   │                  │   │                  │
│  React: soar/    │   │  React: red-team/│   │  React: endpoints│
└──────────────────┘   └──────────────────┘   └──────────────────┘
```

---

## 2. SOAR (Security Orchestration, Automation & Response)

### 2.1 What is SOAR in ACIS?

SOAR in ACIS is the **playbook execution engine** — a configurable, automated responder that can take a sequence of security actions (isolate an endpoint, block an IP, reset a password, send a notification) in response to a detected incident. Instead of an analyst manually executing 10 steps under pressure at 3am, ACIS runs them automatically in seconds.

### 2.2 Backend — `acis-soar` Service

**Service coordinates:** Spring Boot 3.2.x, port 8085, namespace `acis-backend`

#### 2.2.1 Data Models

**Playbook:**
```java
@Entity
@Table(name = "playbooks")
public class Playbook {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID tenantId;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(nullable = false, columnDefinition = "jsonb")
    @Type(JsonBinaryType.class)
    private List<PlaybookStep> steps;

    private boolean enabled = true;
    private int successCount = 0;
    private int runCount = 0;
    private Instant lastRunAt;
    private Instant createdAt;
}
```

**PlaybookStep (JSON structure stored in JSONB):**
```json
{
  "stepIndex": 1,
  "type": "isolate_endpoint",
  "params": {
    "assetId": "{{alert.asset_id}}",
    "reason": "Malware detected via correlation rule"
  },
  "timeoutSeconds": 30,
  "onFailure": "abort"
}
```

**Step Types & Parameters:**

| Step Type | Required Params | Description |
|---|---|---|
| `isolate_endpoint` | `assetId` | Set asset status = QUARANTINED |
| `block_ip` | `ip`, `duration` | Block IP at firewall (webhook) |
| `block_domain` | `domain` | Block domain at proxy + firewall |
| `reset_credentials` | `userId`, `provider` | Force password reset via Okta/M365 |
| `run_script` | `script`, `targets` | Execute script on endpoint(s) via agent |
| `send_notification` | `channel`, `message` | Email/Slack/Teams notification |
| `call_webhook` | `url`, `method`, `body` | Generic HTTP webhook call |

**PlaybookExecution:**
```java
@Entity
@Table(name = "playbook_executions")
public class PlaybookExecution {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID playbookId;
    private UUID triggeredBy;     // user ID
    private String status;        // RUNNING | COMPLETED | FAILED

    @Column(columnDefinition = "jsonb")
    @Type(JsonBinaryType.class)
    private List<StepLog> stepLogs;  // grows as steps execute

    private Instant startedAt;
    private Instant completedAt;
}
```

**StepLog entry (appended per step):**
```json
{
  "stepIndex": 1,
  "stepType": "isolate_endpoint",
  "status": "SUCCESS",
  "startedAt": "2026-05-29T05:10:00Z",
  "completedAt": "2026-05-29T05:10:01.234Z",
  "durationMs": 1234,
  "output": "Asset laptop-332 quarantined successfully",
  "error": null
}
```

#### 2.2.2 REST API Specification

```
GET  /api/soar/playbooks
     → Returns List<PlaybookDTO> for tenant
     → Response: { success, data: [{ id, name, description,
                   stepCount, successCount, runCount, lastRunAt }] }

POST /api/soar/playbooks/{id}/execute
     → Body: { "params": { "targetAssetId": "...", ... } }
     → Creates PlaybookExecution record
     → Fires async @Async task
     → Returns: { success, data: { executionId, status: "RUNNING" } }

GET  /api/soar/executions/{id}
     → Returns current execution state + stepLogs array
     → Clients poll this endpoint for live progress
     → Response: { success, data: { id, status, stepLogs: [...] } }

GET  /api/soar/playbooks/{id}
     → Full playbook detail with step definitions

POST /api/soar/playbooks
     → Create new playbook
     → Body: { name, description, steps: [...] }

PUT  /api/soar/playbooks/{id}
     → Update playbook
```

#### 2.2.3 Async Execution Engine

```java
// AsyncConfig.java
@Configuration
@EnableAsync
public class AsyncConfig {
    @Bean(name = "soarExecutor")
    public Executor soarExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(5);
        executor.setMaxPoolSize(20);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("soar-exec-");
        executor.initialize();
        return executor;
    }
}

// PlaybookService.java
@Service
public class PlaybookService {

    @Async("soarExecutor")
    @Transactional
    public CompletableFuture<Void> executePlaybook(UUID executionId) {
        PlaybookExecution exec = executionRepo.findById(executionId).orElseThrow();
        List<PlaybookStep> steps = exec.getPlaybook().getSteps();

        for (PlaybookStep step : steps) {
            StepLog log = StepLog.of(step);
            try {
                String output = connectorDispatch(step);
                log.succeed(output);
                updateSuccessCount(exec.getPlaybookId());
            } catch (Exception ex) {
                log.fail(ex.getMessage());
                if ("abort".equals(step.getOnFailure())) {
                    exec.setStatus("FAILED");
                    break;
                }
                // "continue" or "retry" handling
            }
            appendLog(executionId, log);
        }

        if (!"FAILED".equals(exec.getStatus())) {
            exec.setStatus("COMPLETED");
        }
        exec.setCompletedAt(Instant.now());
        return CompletableFuture.completedFuture(null);
    }

    private String connectorDispatch(PlaybookStep step) {
        return switch (step.getType()) {
            case "isolate_endpoint" -> isolateConnector.execute(step.getParams());
            case "block_ip"        -> webhookConnector.blockIp(step.getParams());
            case "block_domain"    -> webhookConnector.blockDomain(step.getParams());
            case "reset_credentials" -> oktaConnector.resetPassword(step.getParams());
            case "send_notification" -> notificationConnector.send(step.getParams());
            case "call_webhook"    -> webhookConnector.call(step.getParams());
            default -> throw new IllegalArgumentException("Unknown step type: " + step.getType());
        };
    }
}
```

#### 2.2.4 Pre-seeded Playbooks

**Playbook 1: Isolate Endpoint (EDR)**
```json
{
  "name": "Isolate Endpoint (EDR)",
  "description": "Quarantine a compromised endpoint and notify the security team",
  "steps": [
    {
      "stepIndex": 1,
      "type": "isolate_endpoint",
      "params": { "assetId": "{{params.targetAssetId}}" },
      "timeoutSeconds": 30,
      "onFailure": "abort"
    },
    {
      "stepIndex": 2,
      "type": "send_notification",
      "params": {
        "channel": "email",
        "subject": "ACIS: Endpoint Isolated",
        "message": "Endpoint {{params.targetAssetId}} has been quarantined."
      },
      "timeoutSeconds": 10,
      "onFailure": "continue"
    },
    {
      "stepIndex": 3,
      "type": "call_webhook",
      "params": {
        "url": "{{env.TICKETING_WEBHOOK_URL}}",
        "method": "POST",
        "body": { "title": "Endpoint Isolation", "priority": "P1" }
      },
      "timeoutSeconds": 15,
      "onFailure": "continue"
    }
  ]
}
```

**Playbook 2: Reset Compromised Account**
```json
{
  "name": "Reset Compromised Account",
  "description": "Force password reset and revoke active sessions for a compromised user",
  "steps": [
    {
      "stepIndex": 1,
      "type": "reset_credentials",
      "params": { "userId": "{{params.userId}}", "provider": "okta" },
      "timeoutSeconds": 30,
      "onFailure": "abort"
    },
    {
      "stepIndex": 2,
      "type": "send_notification",
      "params": {
        "channel": "email",
        "subject": "Security: Your account password has been reset",
        "recipient": "{{params.userEmail}}"
      },
      "timeoutSeconds": 10,
      "onFailure": "continue"
    }
  ]
}
```

**Playbook 3: Block Domain on FW & Proxy**
```json
{
  "name": "Block Domain on FW & Proxy",
  "description": "Block a malicious domain at both firewall and proxy layer",
  "steps": [
    {
      "stepIndex": 1,
      "type": "block_domain",
      "params": { "domain": "{{params.domain}}", "layer": "firewall" },
      "timeoutSeconds": 20,
      "onFailure": "continue"
    },
    {
      "stepIndex": 2,
      "type": "block_domain",
      "params": { "domain": "{{params.domain}}", "layer": "proxy" },
      "timeoutSeconds": 20,
      "onFailure": "continue"
    },
    {
      "stepIndex": 3,
      "type": "send_notification",
      "params": {
        "channel": "slack",
        "message": "Domain {{params.domain}} blocked at FW + proxy by ACIS SOAR"
      },
      "timeoutSeconds": 10,
      "onFailure": "continue"
    }
  ]
}
```

### 2.3 Frontend — `SoarPage.tsx`

**Component Architecture:**
```
SoarPage
├── Header: "SOAR Playbooks" + "+ NEW PLAYBOOK" button
├── Grid: 3-column responsive card grid
│   └── PlaybookCard (per playbook)
│       ├── Colour-coded top border (green/amber/red)
│       ├── Playbook name (uppercase, bold)
│       ├── Description (small, muted)
│       ├── Metrics row: Success%, Steps, Runs
│       └── Action buttons: [RUN] [EDIT]
└── Empty state (if no playbooks)
```

**State Management:**
```typescript
// Polling strategy: 5s interval for live updates
const [playbooks, setPlaybooks] = useState<Playbook[]>([])

useEffect(() => {
  fetchPlaybooks()
  const interval = setInterval(fetchPlaybooks, 5000)
  return () => clearInterval(interval)
}, [])

// Execution: optimistic update → refresh
const runPlaybook = async (id: string) => {
  await apiClient.post(`/api/soar/playbooks/${id}/execute`)
  fetchPlaybooks()  // immediate refresh after trigger
}
```

**Visual Design Decisions:**
- Dark card background (`bg-surface-2`) with coloured top border accent
- Colour rotation per card index: `#00FF99` (green) / `#FFAB00` (amber) / `#FF3333` (red)
- Hover state: border brightens, top accent goes to full opacity
- Metrics displayed as monospace numbers for precision feel
- RUN button uses primary fire styling (accent colour, full width on mobile)

---

## 3. Red Team Simulator

### 3.1 What is Red Team Simulator in ACIS?

The Red Team Simulator is ACIS's **continuous purple teaming engine** — it runs scripted attack scenarios (mapped to MITRE ATT&CK) against the platform's own detection capabilities. Each simulation produces real synthetic events into the Kafka pipeline, which surface as real alerts — letting you validate whether your correlation rules would actually catch a real attack.

> **Key insight:** Most SOCs discover their detection gaps when they're breached, not before. ACIS's Red Team Simulator lets you find those gaps safely, continuously, in production.

### 3.2 Backend — Red Team API (within `acis-soar`)

```
GET  /api/red-team/simulations
     → List all simulations for tenant
     → Response: [{ id, name, description, mitreTechniques[], mitreTactics[],
                    stepCount, runCount, lastRunAt }]

POST /api/red-team/simulations/{id}/start
     → Start async simulation run
     → Returns: { executionId, status: "RUNNING" }

GET  /api/red-team/simulations/{id}/results
     → Detection coverage report for last run
     → Response: { detectionRate, techniquesDetected, totalTechniques, gaps[] }
```

#### 3.2.1 RedTeam Data Model

```java
@Entity
@Table(name = "red_team_simulations")
public class RedTeamSimulation {
    @Id
    private UUID id;
    private UUID tenantId;
    private String name;
    private String description;

    @Type(JsonBinaryType.class)
    private List<String> mitreTechniques;   // ["T1566.001", "T1204.002"]

    @Type(JsonBinaryType.class)
    private List<String> mitreTactics;      // ["initial-access", "execution"]

    @Type(JsonBinaryType.class)
    private List<SimulationStage> steps;    // ordered stages

    private int runCount;
    private Instant lastRunAt;
}
```

#### 3.2.2 Simulation Runner — Async Stage Execution

```java
@Async("soarExecutor")
public CompletableFuture<Void> runSimulation(UUID simulationId) {
    RedTeamSimulation sim = simRepo.findById(simulationId).orElseThrow();
    List<SimulationStage> stages = sim.getSteps();

    for (SimulationStage stage : stages) {
        // Produce synthetic event to Kafka
        EventDTO syntheticEvent = EventDTO.builder()
            .eventId(UUID.randomUUID().toString())
            .tenantId(sim.getTenantId().toString())
            .timestamp(Instant.now().toString())
            .sourceType(stage.getEventType())
            .action(stage.getAction())
            .severity("high")
            .tags(List.of("red-team", "simulation", stage.getTechnique()))
            .raw("[RED-TEAM] Stage " + stage.getStage() + ": " + stage.getName())
            .build();

        kafkaTemplate.send("acis.raw.events",
            sim.getTenantId().toString(),
            syntheticEvent);

        // Wait between stages (realistic timing)
        Thread.sleep(stage.getDelayMs());
    }

    sim.setRunCount(sim.getRunCount() + 1);
    sim.setLastRunAt(Instant.now());
    simRepo.save(sim);

    return CompletableFuture.completedFuture(null);
}
```

#### 3.2.3 Pre-seeded Simulations

**Simulation 1: Phishing → Initial Access**
```json
{
  "name": "Phishing → Initial Access",
  "mitreTechniques": ["T1566.001", "T1204.002", "T1059.001"],
  "mitreTactics": ["initial-access", "execution"],
  "steps": [
    { "stage": 1, "name": "Spearphishing Email Sent",     "eventType": "email",    "action": "PHISHING_EMAIL_SENT",    "technique": "T1566.001", "delayMs": 2000 },
    { "stage": 2, "name": "User Opens Malicious Attachment","eventType": "endpoint", "action": "MALICIOUS_LINK_CLICKED", "technique": "T1204.002", "delayMs": 3000 },
    { "stage": 3, "name": "PowerShell Dropper Executed",   "eventType": "edr",      "action": "SUSPICIOUS_POWERSHELL",  "technique": "T1059.001", "delayMs": 2000 },
    { "stage": 4, "name": "C2 Beacon Established",         "eventType": "firewall", "action": "C2_COMMUNICATION",       "technique": "T1071.001", "delayMs": 3000 }
  ]
}
```

**Simulation 2: Living-off-the-Land Lateral Movement**
```json
{
  "name": "Living-off-the-Land Lateral Movement",
  "mitreTechniques": ["T1021.002", "T1047", "T1076"],
  "mitreTactics": ["lateral-movement", "execution"],
  "steps": [
    { "stage": 1, "name": "SMB Admin Share Access",        "eventType": "endpoint", "action": "SMB_ADMIN_SHARE_ACCESS",  "technique": "T1021.002", "delayMs": 2000 },
    { "stage": 2, "name": "WMI Remote Execution",          "eventType": "edr",      "action": "WMI_REMOTE_EXEC",         "technique": "T1047",     "delayMs": 3000 },
    { "stage": 3, "name": "RDP Lateral Movement",          "eventType": "edr",      "action": "RDP_LATERAL_MOVEMENT",    "technique": "T1076",     "delayMs": 2500 },
    { "stage": 4, "name": "Credentials Dumped via LSASS",  "eventType": "edr",      "action": "LSASS_ACCESS",            "technique": "T1003.001", "delayMs": 2000 }
  ]
}
```

**Simulation 3: Data Exfiltration via DNS**
```json
{
  "name": "Data Exfil via DNS",
  "mitreTechniques": ["T1048.003", "T1041"],
  "mitreTactics": ["exfiltration"],
  "steps": [
    { "stage": 1, "name": "Staged Data Collection",        "eventType": "endpoint", "action": "SENSITIVE_FILE_ACCESS",   "technique": "T1074.001", "delayMs": 2000 },
    { "stage": 2, "name": "DNS Tunnelling Detected",        "eventType": "firewall", "action": "DNS_TUNNELLING",          "technique": "T1048.003", "delayMs": 3000 },
    { "stage": 3, "name": "Unusual Outbound DNS Volume",    "eventType": "proxy",    "action": "EXCESSIVE_DNS_QUERIES",   "technique": "T1048.003", "delayMs": 2000 },
    { "stage": 4, "name": "Large Outbound Transfer",        "eventType": "firewall", "action": "LARGE_OUTBOUND_TRANSFER", "technique": "T1041",     "delayMs": 2500 }
  ]
}
```

### 3.3 Frontend — `RedTeamPage.tsx`

**Component Architecture:**
```
RedTeamPage
├── Header: "Red Team Simulator" (danger/red text)
│   └── Subtitle: "Continuous Attack Emulation & Validation"
├── Grid: 3-column responsive card grid
│   └── SimulationCard (per simulation)
│       ├── MITRE technique badges (red, danger styling)
│       ├── MITRE tactic badges (muted styling)
│       ├── Skull watermark icon (opacity 0.1 → 0.2 on hover)
│       ├── Simulation name (white, uppercase)
│       ├── Description (muted, small)
│       ├── Metrics: Steps count, Run count
│       └── [INITIATE ATTACK] button (full width, danger colour)
└── Empty state (dashed danger border)
```

**Design Intent:**
- Red (`#FF3333`) as the primary colour for all red team UI elements
- Skull icon as a danger signal — transitions from ghost to visible on hover
- "INITIATE ATTACK" deliberately provocative — makes analyst pause before clicking
- MITRE badges styled like threat intel tags (red bg, red border)
- Card border: danger/40 normally, danger at full opacity on hover

---

## 4. Endpoints & Network (Self-Healing)

### 4.1 What is Self-Healing in ACIS?

Self-Healing Endpoints is ACIS's **automated containment and remediation** capability. When a threat is detected on an endpoint — via correlation rule, SOAR playbook, or manual analyst action — ACIS can:

1. **Isolate** the endpoint (cut network access, quarantine)
2. **Rollback** to a clean snapshot (restore known-good state)
3. **Monitor** health in real-time (WebSocket live updates)

### 4.2 Backend — Asset Service Endpoints Module

The Endpoints module is served by `acis-assets` (port 8086), which manages the full asset registry. Endpoints (type = WORKSTATION or SERVER) have additional health/isolation fields.

**Asset Health State Machine:**
```
ACTIVE (OK)
    │
    │ isolate_endpoint action
    ▼
QUARANTINED (Isolated)
    │
    ├── rollback → ACTIVE (OK)          [snapshot restored]
    └── decommission → DECOMMISSIONED   [permanent removal]
```

**API for Endpoint Control:**
```
PUT /api/assets/{id}/status
Content-Type: application/json
Authorization: Bearer {jwt}
X-Tenant-ID: {tenant_id}

Request body (Isolate):
{
  "status": "QUARANTINED",
  "health": "QUARANTINED",
  "isolated": true
}

Request body (Rollback):
{
  "status": "ACTIVE",
  "health": "OK",
  "isolated": false
}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "laptop-332",
    "status": "QUARANTINED",
    "health": "QUARANTINED",
    "isolated": true,
    "updatedAt": "2026-05-29T05:10:00Z"
  }
}
```

**Asset endpoint filter (EndpointsPage query):**
```
GET /api/assets?type=WORKSTATION,SERVER&page=0&size=50
```

Note: The Endpoints module filters the full asset list to only WORKSTATION and SERVER types, reusing the `acis-assets` service — no separate endpoint service required.

### 4.3 Frontend — `EndpointsPage.tsx`

**Component Architecture:**
```
EndpointsPage
├── Header: "Endpoints & Network"
│   └── Subtitle: "Auto-isolation · rollback · policy drift repair"
├── Card: Table container
│   └── Table
│       ├── Headers: Endpoint Name | Health | OS/IP | Isolation | Actions
│       ├── Loading state: "Loading endpoints..."
│       ├── Empty state: "No endpoints found."
│       └── Rows (per endpoint):
│           ├── Name: Server icon + uppercase name
│           ├── Health: ShieldCheck (green/OK) or ShieldAlert (red/Quarantined)
│           ├── OS/IP: OS name + IP address
│           ├── Isolation: "Isolated" (red) or "No" (muted)
│           └── Actions: [ROLLBACK] (success) or [ISOLATE] (danger)
└── 5-second polling
```

**Health Badge Logic:**
```typescript
const isQuarantined = ep.status === 'QUARANTINED'

// Health icon
isQuarantined
  ? <ShieldAlert className="text-danger" />
  : <ShieldCheck className="text-success" />

// Health text
isQuarantined ? "Quarantined" : "OK"

// Action button
isQuarantined
  ? <button onClick={handleRollback}>ROLLBACK</button>
  : <button onClick={handleIsolate}>ISOLATE</button>
```

**Isolate flow with spinner:**
```typescript
const [isolating, setIsolating] = useState<string | null>(null)

const handleIsolate = async (id: string) => {
  setIsolating(id)    // show spinner on this specific row
  try {
    await apiClient.put(`/api/assets/${id}/status`, {
      status: 'QUARANTINED',
      health: 'QUARANTINED',
      isolated: true
    })
    fetchEndpoints()  // immediate refresh
  } finally {
    setIsolating(null)
  }
}

// Button renders spinner if isolating === ep.id
{isolating === ep.id
  ? <Activity className="animate-spin" />
  : <ShieldAlert />
}
```

---

## 5. Integration Points Between Phase 5 Modules

### 5.1 Alert → SOAR Integration

When an analyst clicks "Run Playbook" in the Alerts module (Module 05), it should:

```
Analyst clicks "Run Playbook" on alert AL-0042
    │
    ▼
Playbook Selector Modal opens
    │ Lists all enabled playbooks for tenant
    │ Pre-suggests relevant playbooks based on alert type
    ▼
Analyst selects "Isolate Endpoint (EDR)"
    │
    ▼
Parameter modal:
    │ Target Asset: [asset linked to alert]
    │ Confirm? [RUN PLAYBOOK]
    ▼
POST /api/soar/playbooks/{id}/execute
    Body: { "params": { "targetAssetId": "...", "alertId": "AL-0042" } }
    │
    ▼
Execution log overlay appears in alert detail drawer
    │ Step 1: Isolating endpoint...    ✓
    │ Step 2: Sending notification...  ✓
    │ Step 3: Creating ticket...       ✓
    ▼
Alert status auto-updated: INVESTIGATING
Endpoint status: QUARANTINED
```

**Status:** 🔵 In Progress

### 5.2 Red Team → Alert Pipeline Integration

Each red team simulation stage produces a synthetic Kafka event that flows through the full detection pipeline:

```
Red Team Stage fires synthetic event
    │
    ├─► acis.raw.events Kafka topic
    │       (tagged: "red-team", "simulation")
    │
    ├─► Elasticsearch indexed
    │       (visible in Log Explorer)
    │
    ├─► Flink CEP evaluates correlation rules
    │       (if rule matches → alert fires)
    │
    └─► Alert appears in Alerts module
            (with red-team tag visible)
```

**Detection Coverage Calculation:**
```
techniquesTotal = simulation.mitreTechniques.length
techniquesDetected = alerts.filter(a =>
    a.tags.includes("red-team") &&
    a.mitreTechnique in simulation.mitreTechniques
).uniqueMitreTechniques.length

detectionRate = (techniquesDetected / techniquesTotal) * 100
```

---

## 6. Phase 5 — Technical Challenges & Solutions

| Challenge | Solution Chosen |
|---|---|
| **Async playbook execution without blocking API thread** | Spring `@Async` with dedicated `soarExecutor` thread pool (5–20 threads) |
| **Live step-by-step progress in UI** | Client polls `GET /api/soar/executions/{id}` every 2s (WebSocket planned for Phase 5.1) |
| **Red team events vs real events** | `tags: ["red-team", "simulation"]` — visible in Log Explorer, filterable |
| **Step failure handling** | Per-step `onFailure: abort|continue|retry` — flexible error policy |
| **Endpoint isolation without real agent** | PUT /api/assets/{id}/status updates DB state; real agent webhook planned for Phase 7 |
| **MITRE technique badge display** | Array stored as JSONB strings; frontend maps to badge components |
| **Simulation timing realism** | Configurable `delayMs` per stage; default 2-3 seconds between stages |

---

## 7. Phase 5 — Testing Strategy

### 7.1 Manual Testing Checklist

```
SOAR Playbooks:
□ Navigate to /dashboard/soar → 3 playbook cards visible
□ Click RUN on "Isolate Endpoint (EDR)" → execution starts
□ Poll GET /api/soar/executions/{id} → step logs growing
□ Check metrics: run_count incremented after completion
□ Check endpoint in Endpoints module: status = QUARANTINED

Red Team Simulator:
□ Navigate to /dashboard/red-team → 3 simulation cards visible
□ MITRE badges display on each card
□ Click "INITIATE ATTACK" on "Phishing → Initial Access"
□ Wait 10 seconds → check Log Explorer: 4 new events with red-team tag
□ Check Alerts: if correlation rules match → new alert fired
□ run_count incremented on simulation card

Endpoints & Network:
□ Navigate to /dashboard/endpoints → endpoints table loads
□ WORKSTATION and SERVER assets visible; FIREWALL excluded
□ Health badge shows correct colour: OK=green, QUARANTINED=red
□ Click ISOLATE → spinner shows → status updates to QUARANTINED
□ Click ROLLBACK → status reverts to ACTIVE
□ 5-second auto-refresh keeps table current
```

### 7.2 API Testing (curl)

```bash
# Run a playbook
curl -X POST http://localhost:8080/api/soar/playbooks/{id}/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"params": {"targetAssetId": "asset-uuid-here"}}'

# Check execution status
curl http://localhost:8080/api/soar/executions/{executionId} \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: $TENANT_ID"

# Start a red team simulation
curl -X POST http://localhost:8080/api/red-team/simulations/{id}/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: $TENANT_ID"

# Isolate an endpoint
curl -X PUT http://localhost:8080/api/assets/{assetId}/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "QUARANTINED", "health": "QUARANTINED", "isolated": true}'
```

---

## 8. Phase 5 — Open Items & Next Steps

| Item | Priority | Owner | ETA |
|---|---|---|---|
| Alert → "Run Playbook" action wiring | HIGH | Backend + Frontend | Sprint 13 |
| Live WebSocket execution log (replace polling) | HIGH | Backend | Sprint 13 |
| New Playbook builder modal (step editor) | MEDIUM | Frontend | Sprint 14 |
| Real agent webhook for isolation (vs DB-only) | MEDIUM | Backend | Phase 7 |
| Simulation detection coverage report UI | MEDIUM | Frontend | Sprint 13 |
| Red team simulation scheduling (cron-based) | LOW | Backend | Phase 6 |
| Playbook template library (community playbooks) | LOW | Product | Phase 8 |
| SOAR audit logging integration | HIGH | Backend | Sprint 13 |

---

## 9. Phase 5 Acceptance Criteria — Final Checklist

```
✅ acis-soar service starts and registers with gateway
✅ GET /api/soar/playbooks returns seeded playbooks
✅ POST /api/soar/playbooks/{id}/execute creates execution record
✅ Execution steps logged sequentially in step_logs JSONB
✅ playbook.run_count and success_count update correctly
✅ GET /api/red-team/simulations returns seeded simulations
✅ POST /api/red-team/simulations/{id}/start produces events to Kafka
✅ Red team events appear in Log Explorer with red-team tag
✅ GET /api/assets returns WORKSTATION and SERVER assets
✅ PUT /api/assets/{id}/status QUARANTINED → isolated field = true
✅ PUT /api/assets/{id}/status ACTIVE → isolated field = false
✅ SOAR Playbooks UI: card grid renders with correct metrics
✅ Red Team UI: MITRE badges display on cards
✅ Endpoints UI: health badges correct colour per status
✅ Endpoints UI: Isolate action shows spinner, updates table
✅ Endpoints UI: Rollback action restores ACTIVE status
🔵 Alert detail drawer: "Run Playbook" opens selector
🔵 Execution log: live step-by-step progress visible in UI
```

---

*Document Version 1.0 — NETCRADUS ACIS Engineering — Phase 5 Deep Dive*  
