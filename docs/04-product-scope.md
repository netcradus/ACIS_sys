# NETCRADUS ACIS — Product Scope Document

**Document Version:** 1.0  
**Date:** May 2026  
**Classification:** Internal — Product / Business  
**Author:** Kumar Ujjwal 

---

## 1. Product Vision

**NETCRADUS ACIS** (Autonomous Cyber Immune System) is a unified, AI-powered cybersecurity platform purpose-built for SMEs and MSSPs who need enterprise-grade protection without enterprise-grade budgets or headcount.

> **Tagline:** *SIEM · SOAR · Self-Healing · Swarm Intel*

Where legacy SIEM vendors (Splunk, IBM QRadar) require a team of trained analysts and months of tuning, ACIS is designed to be **autonomous by default** — detecting threats, responding to incidents, and healing endpoints with minimal human intervention.

---

## 2. Target Market

### 2.1 Primary Segments

| Segment | Description | Pain Points Solved |
|---|---|---|
| **UK SMEs (50–500 employees)** | Mid-market businesses with limited IT security budget | No dedicated SOC, can't afford Splunk/CrowdStrike licensing |
| **MSSPs** | Managed Security Service Providers serving SME clients | Need multi-tenant platform, white-label potential, low ops overhead |
| **Compliance-Driven Businesses** | Financial services, healthcare, legal firms | NIS2, GDPR, ISO 27001 compliance evidence generation |
| **SaaS / Tech Companies** | Cloud-native companies with AWS/Azure/GCP estates | Cloud workload monitoring, IAM anomaly detection |

### 2.2 Geographic Focus

- **Primary:** United Kingdom (initial GTM)
- **Secondary:** EU (NIS2 compliance alignment), North America (SOC 2 alignment)
- **Future:** APAC, Middle East (follow MSSP channel expansion)

### 2.3 Competitive Landscape

| Competitor | Positioning | ACIS Advantage |
|---|---|---|
| **Splunk Enterprise** | Industry standard SIEM | 10x cheaper, autonomous response, no PhD analysts required |
| **Microsoft Sentinel** | Azure-native SIEM | Vendor-agnostic, works with any cloud, no lock-in |
| **CrowdStrike Falcon** | EDR-focused | Broader SIEM + compliance scope, more affordable |
| **Darktrace** | AI-driven NDR | Open source core, transparent AI, no black-box pricing |
| **Elastic Security** | Open core SIEM | Managed + autonomous response baked in, simpler deployment |

---

## 3. Product Architecture Overview

ACIS is delivered as a **multi-tenant SaaS** with the following tiers:

### 3.1 Deployment Options

| Option | Description | Target |
|---|---|---|
| **SaaS (Managed)** | Hosted by NETCRADUS on cloud | SMEs, quick start |
| **Private Cloud** | Customer's K8s cluster, NETCRADUS managed | MSSPs, regulated industries |
| **Air-Gapped** | Fully offline, no internet dependency | Government, defence contractors |

### 3.2 Pricing Tiers (Proposed)

| Tier | Events/Day | Users | SOAR | AI Features | Price |
|---|---|---|---|---|---|
| **Starter** | 1M events | 3 users | 3 playbooks | Basic anomaly | £299/mo |
| **Growth** | 10M events | 10 users | Unlimited | Full AI + LLM | £999/mo |
| **Enterprise** | Unlimited | Unlimited | Unlimited | Custom models | Custom |
| **MSSP** | Per-tenant billing | Unlimited | Unlimited | Full + white-label | Custom |

---

## 4. Feature Scope — The 13 Modules

### Module 01 — Authentication & Identity (`/login`)

**Status: ✅ Complete (Phase 1)**

| Feature | Description |
|---|---|
| Email + password login | Standard credential authentication |
| SSO via Keycloak | OIDC redirect, SAML 2.0 support |
| JWT authentication | httpOnly cookie storage, RS256 signed |
| "Remember Me" | Extended session refresh token |
| Workspace registration | Self-service tenant provisioning |
| Protected routes | Unauthenticated redirect to /login |
| Session management | Automatic token refresh, logout |

---

### Module 02 — Security Operations Dashboard (`/dashboard`)

**Status: ✅ Complete (Phase 3)**

| Feature | Description |
|---|---|
| KPI Cards | Events/24h, Notable Events, Mean TTD, Mean TTR |
| Ingest Volume Chart | Live area chart, 8-hour window, WebSocket |
| Alert Severity Donut | Critical/High/Medium/Low distribution |
| Open Incidents Table | Sortable, clickable rows, live updates |
| Real-time WebSocket | STOMP over SockJS, auto-reconnect |
| Dashboard summary API | Aggregated KPIs from backend |

---

### Module 03 — Log Explorer (`/dashboard/logs`)

**Status: ✅ Complete (Phase 2)**

| Feature | Description |
|---|---|
| SPL-style query bar | Syntax: `index=<name> sourcetype=<type> \| stats count by field` |
| CodeMirror/Monaco editor | Syntax highlighting, autocomplete |
| Event Trend bar chart | Last 60 minutes, updates on search |
| AG Grid results table | Virtualised, 100 rows/page, server-side |
| Export CSV | Full result set download |
| Save Search | Named search persistence |
| Server-side pagination | 100 rows/page from Elasticsearch |
| Field filters | src_ip, dest_ip, user, action, sourcetype |

---

### Module 04 — Correlation Searches (`/dashboard/correlation`)

**Status: ✅ Complete (Phase 3)**

| Feature | Description |
|---|---|
| Rule management table | Name, enabled toggle, last run, risk score |
| Enable/disable toggle | Real-time Flink job start/stop |
| New Rule modal | Name, SPL query, schedule, threshold, severity |
| Risk score badges | 0–39 green, 40–69 amber, 70–100 red |
| Pre-seeded rules | Impossible Travel, Priv Esc, 401 Failures, ASR Bypass |
| Rule types | Threshold, Sequence, Statistical deviation |
| Flink integration | Per-rule streaming job submission |

---

### Module 05 — Alerts & Incidents (`/dashboard/alerts`)

**Status: ✅ Complete (Phase 3)**

| Feature | Description |
|---|---|
| Alerts tab | ID, Title, Severity, Source, Status, Owner, Respond |
| Incidents tab | Grouped incidents with linked alerts |
| Severity badges | Critical=red, High=orange, Medium=yellow, Low=blue |
| Actions dropdown | Assign, Create Incident, Run Playbook, Acknowledge |
| Detail drawer | Full alert context, raw log, assets, timeline |
| Alert lifecycle | OPEN → INVESTIGATING → MITIGATED → CLOSED |
| Incident promotion | Alert → INC-XXXX |
| Deduplication | Identical alerts within 5 min merged |
| Real-time push | New alerts via WebSocket |

---

### Module 06 — Assets & Identities (`/dashboard/assets`)

**Status: ✅ Complete (Phase 3/5)**

| Feature | Description |
|---|---|
| Asset table | Name, Type, Owner, Criticality, Tags, Last Seen |
| Filter by type/criticality | Dynamic filter controls |
| Asset detail drawer | Linked alerts, identity stitching, incidents |
| Add Asset form | Inline creation form |
| Identity stitching | User accounts linked to assets |
| Criticality badges | High/Medium/Low colour coding |

---

### Module 07 — Threat Intelligence Swarm (`/dashboard/threat-intel`)

**Status: ✅ Complete (Phase 4)**

| Feature | Description |
|---|---|
| IOC enrichment panel | Paste IP/hash/domain → verdict + sources + risk score |
| LLM threat summary | GPT-4o narrative of threat profile |
| Community signals feed | Live anonymised IOC detections from swarm |
| Swarm health widget | Active nodes, last sync time, model version |
| 24-hour cache | No redundant LLM calls for same indicator |
| Indicator types | IPv4, IPv6, MD5/SHA1/SHA256, domain, URL |

---

### Module 08 — SOAR Playbooks (`/dashboard/soar`)

**Status: ✅ Complete (Phase 5)**

| Feature | Description |
|---|---|
| Playbook card grid | Name, steps count, success rate %, last run, run count |
| Run playbook modal | Parameter input → confirm → live execution log |
| New Playbook builder | Step type + params editor |
| Edit playbook | Modify existing playbook definition |
| Live execution log | Step-by-step progress via WebSocket |
| Success rate tracking | Per-playbook run/success counters |
| Pre-seeded playbooks | Isolate Endpoint, Reset Account, Block Domain |
| Step types | 7 action types (isolate, block, reset, notify, webhook, etc.) |
| Integration connectors | HTTP webhook, Microsoft 365 (mock), Okta (mock) |

---

### Module 09 — Red Team Simulator (`/dashboard/red-team`)

**Status: ✅ Complete (Phase 5)**

| Feature | Description |
|---|---|
| Simulation card grid | Name, MITRE ATT&CK tags, steps, run count |
| MITRE ATT&CK badges | Technique + tactic pill badges (colour coded) |
| Initiate Attack modal | Confirmation → live step progress feed |
| Detection coverage | % techniques detected, gaps identified |
| Synthetic event production | Stages produce real Kafka events |
| Pre-seeded simulations | Phishing→Access, Living-off-Land, DNS Exfil |
| Results in alerts | Detection events surface as real alerts |

---

### Module 10 — Endpoints & Network (`/dashboard/endpoints`)

**Status: ✅ Complete (Phase 5)**

| Feature | Description |
|---|---|
| Endpoint health table | Name, Health badge, OS, IP, Isolation status |
| Health badges | OK (green), Degraded (amber), Quarantined (red) |
| Isolate endpoint | One-click → QUARANTINED status, agent network cut |
| Rollback endpoint | Restore → ACTIVE, revert from snapshot |
| Self-healing header | "Auto-isolation · rollback · policy drift repair" |
| Live updates | 5-second poll + WebSocket health push |
| Filter by health | Show only quarantined / degraded endpoints |

---

### Module 11 — Compliance & Audit (`/dashboard/compliance`)

**Status: ✅ Complete (Phase 6)**

| Feature | Description |
|---|---|
| NIS2 posture card | Score, progress bar, satisfied controls count |
| GDPR posture card | Score, progress bar, satisfied controls count |
| ISO 27001 posture card | Score, progress bar, satisfied controls count |
| Control breakdown | Per-framework control list, pass/fail per item |
| Export compliance report | One-click PDF generation |
| Compliance data API | Computed from control checklist in PostgreSQL |

---

### Module 12 — Reports (`/dashboard/reports`)

**Status: ✅ Complete (Phase 6)**

| Feature | Description |
|---|---|
| Report template cards | Weekly Executive (PDF), Incident Board (PPTX), Detection Coverage (CSV) |
| Format badges | PDF / PPTX / CSV visual indicator |
| Download button | On-demand generation + download |
| Schedule modal | Frequency + email recipients |
| Report templates | executive_summary, incident_board, detection_coverage, compliance_posture |
| Scheduled delivery | Spring @Scheduled + Spring Mail |

---

### Module 13 — Settings (`/dashboard/settings`)

**Status: ✅ Complete (Phase 6)**

| Feature | Description |
|---|---|
| RBAC permission matrix | Viewer/Analyst/Engineer/Admin × 4 capability columns |
| API Keys tab | Key list, revoke button, generate new key |
| Integrations tab | EDR/Firewall/Cloud/Email connector cards |
| Workspace tab | Workspace name, timezone, data retention config |
| Audit log | Every write action logged to `audit_log` table |

---

## 5. Compliance Coverage

### 5.1 Framework Alignment

| Framework | Coverage | Key Controls |
|---|---|---|
| **NIS2 (EU)** | Security measures, incident reporting, supply chain | Log monitoring (SIEM), incident response (SOAR), vendor controls |
| **GDPR** | Data breach detection, 72-hour notification | Anomaly detection, alert automation, audit trail |
| **ISO 27001** | A.12 Operations, A.16 Incident Management | Log management, SOAR playbooks, access controls |
| **UK Cyber Essentials** | Firewall, patch management, access control, malware | Endpoint monitoring, asset management, policy enforcement |

### 5.2 Compliance Features

| Feature | Frameworks |
|---|---|
| Immutable audit log | ISO 27001, GDPR, NIS2 |
| Automated incident response | NIS2, ISO 27001 |
| Access control matrix (RBAC) | ISO 27001, UK CE |
| Data retention configuration | GDPR |
| Compliance posture dashboard | ISO 27001, NIS2, GDPR |
| Downloadable compliance reports | All |
| Breach notification alerts | GDPR, NIS2 |

---

## 6. AI / ML Features

### 6.1 Current AI Capabilities

| Capability | Technology | Use Case |
|---|---|---|
| **Anomaly Detection** | Isolation Forest | Flag unusual user behaviour, atypical login patterns |
| **Threat Classification** | XGBoost | Auto-categorise: malware/exfil/lateral/phishing/privesc |
| **MITRE ATT&CK Mapping** | FAISS + OpenAI Embeddings | Map any event description to ATT&CK technique |
| **Alert Explanation** | LangChain + GPT-4o | Plain-English briefing + recommended action for analysts |
| **NL→SPL Translation** | LangChain + GPT-4o | Convert "show me failed logins from admin users" → SPL |
| **IOC Enrichment** | LangChain + VirusTotal context | Threat verdict, campaign links, risk scoring |
| **Risk Scoring** | Composite algorithm | 0–100 entity risk score from multiple signals |

### 6.2 AI Roadmap (Future Phases)

| Feature | Phase | Description |
|---|---|---|
| **Swarm Intelligence** | Phase 6+ | Federated IOC sharing across tenant nodes (anonymised) |
| **Auto-Playbook Generation** | Phase 7 | LLM generates playbook from incident description |
| **Predictive Risk Scoring** | Phase 7 | Time-series risk trend prediction |
| **Custom Model Training** | Phase 8 | Per-tenant anomaly model on their own data |
| **Autonomous Hunting** | Phase 8 | AI-driven threat hunting without analyst input |
| **MITRE Coverage Gap Analysis** | Phase 6 | Identify detection blindspots in ATT&CK matrix |

---

## 7. Integration Ecosystem

### 7.1 Data Ingest Integrations

| Integration | Protocol | Status |
|---|---|---|
| Syslog (RFC 5424) | UDP/TCP 514 | ✅ Active |
| CEF (Common Event Format) | Syslog/TCP | ✅ Active |
| LEEF (IBM QRadar format) | Syslog/TCP | ✅ Active |
| JSON REST API | HTTP POST | ✅ Active |
| AWS CloudTrail | S3 + SQS | 🔲 Roadmap |
| Azure Sentinel connector | Azure Event Hub | 🔲 Roadmap |
| Google Cloud Logging | Pub/Sub | 🔲 Roadmap |
| Okta System Log | REST Polling | 🔲 Roadmap |
| Microsoft 365 | Microsoft Graph API | 🔲 Roadmap |

### 7.2 SOAR Action Integrations

| Integration | Type | Status |
|---|---|---|
| HTTP Webhook (generic) | REST | ✅ Active |
| Microsoft 365 | Email, user management | ✅ Mock |
| Okta | User disable, password reset | ✅ Mock |
| PagerDuty | Alert escalation | 🔲 Roadmap |
| Slack / Teams | Notification | 🔲 Roadmap |
| Jira | Ticket creation | 🔲 Roadmap |
| AWS EC2 | Instance isolation | 🔲 Roadmap |
| CrowdStrike RTR | Remote endpoint action | 🔲 Roadmap |

---

## 8. Non-Functional Requirements

### 8.1 Security Requirements

| Requirement | Implementation |
|---|---|
| Zero-trust architecture | JWT validation on every request at gateway |
| Multi-tenancy isolation | PostgreSQL RLS + Elasticsearch per-tenant indices |
| Data encryption at rest | AES-256 (K8s etcd, EBS/PD encrypted volumes) |
| Data encryption in transit | TLS 1.3 minimum |
| Audit trail | Immutable `audit_log` table, all write actions |
| Vulnerability management | Dependabot + Trivy container scanning in CI |
| Penetration testing | Annual third-party pentest (Phase 7+) |

### 8.2 Availability Requirements

| Service | SLA Target |
|---|---|
| Platform overall | 99.9% uptime (< 44 min/month) |
| API Gateway | 99.95% |
| Alert ingestion pipeline | 99.9% (no alert loss) |
| Dashboard + UI | 99.5% |
| Report generation | 99% (best effort) |

### 8.3 Data Privacy Requirements

| Requirement | Implementation |
|---|---|
| GDPR compliance | Tenant data deletable on request |
| Data residency | Deployable in EU regions (AWS eu-west-2) |
| PII handling | User emails hashed in logs, full in DB |
| Right to erasure | Tenant delete API cascades all data |
| Data retention | Configurable per tenant (default 90 days events) |

---

## 9. Out of Scope (Current Version)

The following capabilities are explicitly **out of scope** for the current platform version (Phases 1–6) and are candidates for future roadmap:

| Feature | Reason | Roadmap |
|---|---|---|
| Network Detection & Response (NDR) | Requires dedicated packet inspection agents | Phase 8+ |
| Vulnerability scanning | Different product category (ASM) | Partnership with Tenable/Qualys |
| Mobile device management (MDM) | Out of SOC platform scope | Phase 9+ |
| Blockchain audit trail | Not required for compliance targets | Evaluate Phase 8 |
| Physical security integration | Out of cyber scope | Not planned |
| Custom LLM fine-tuning | Significant cost and complexity | Phase 8+ |
| SOAR no-code visual builder | Drag-and-drop workflow editor | Phase 7 |

---

## 10. Product Roadmap Summary

```
2026 Q1-Q2    ████████████████  Phase 1-4: Core SIEM + AI
              Foundation + Auth → Log Pipeline → Correlation → AI ML

2026 Q3       ████████          Phase 5: SOAR + Red Team + Endpoints
              Playbook execution · Red team simulation · Self-healing

2026 Q3-Q4    ████████          Phase 6: Compliance + Reports + Settings
              NIS2/GDPR/ISO27001 · PDF/PPTX reports · RBAC settings

2027 Q1       ████              Phase 7: Production K8s + Hardening
              Helm charts · GitHub Actions · mTLS · Load testing

2027 Q2-Q3    ████              Phase 8: Advanced AI + Integrations
              Autonomous hunting · Custom models · AWS/Azure connectors

2027 Q4+      ████              Phase 9: Enterprise Features
              NDR · Visual SOAR builder · Air-gap deployment
```

---

*Document Version 1.0 — NETCRADUS ACIS Product*  