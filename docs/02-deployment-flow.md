# NETCRADUS ACIS — Deployment Flow & CI/CD Diagrams

**Document Version:** 1.0  
**Date:** May 2026  
**Classification:** Internal — DevOps / Engineering  
**Author:** Kumar Ujjwal 

---

## 1. Overview

This document details the deployment architecture, CI/CD pipelines, and operational flows for the NETCRADUS ACIS platform across development, staging, and production environments.

---

## 2. Environment Architecture

### 2.1 Three-Environment Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    NETCRADUS ACIS ENVIRONMENTS                   │
├──────────────────┬──────────────────┬───────────────────────────┤
│   DEVELOPMENT    │     STAGING      │      PRODUCTION            │
│                  │                  │                            │
│  Docker Compose  │  Kubernetes      │  Kubernetes (HA)           │
│  Local machine   │  Single-node     │  Multi-node cluster        │
│                  │  or Minikube     │  3+ control plane nodes    │
│                  │                  │                            │
│  Hot-reload      │  Near-prod       │  Full HA, autoscaling      │
│  No TLS          │  TLS enabled     │  mTLS, NetworkPolicies     │
│  Mock AI calls   │  Real AI service │  Full AI + LLM             │
│  Seed data       │  Synthetic data  │  Live tenant data          │
│                  │                  │                            │
│  Start: 1 cmd    │  Deploy: Helm    │  Deploy: Helm + GitOps     │
│  docker compose  │  helm upgrade    │  ArgoCD / FluxCD           │
│  up --build      │  --install       │  automated rollout         │
└──────────────────┴──────────────────┴───────────────────────────┘
```

### 2.2 Port Allocation (Development)

| Service | Port | Protocol |
|---|---|---|
| React Frontend | 3000 | HTTP |
| acis-gateway | 8080 | HTTP |
| acis-alerts | 8081 | HTTP |
| acis-search | 8082 | HTTP |
| acis-correlation | 8083 | HTTP |
| acis-ingestion | 8084 | HTTP |
| acis-soar | 8085 | HTTP |
| acis-assets | 8086 | HTTP |
| acis-threat-intel | 8087 | HTTP |
| acis-reports | 8088 | HTTP |
| ai-service | 8090 | HTTP + gRPC |
| Keycloak | 8180 | HTTP |
| PostgreSQL | 5432 | TCP |
| Kafka | 9092 | TCP |
| Elasticsearch | 9200 | HTTP |
| ClickHouse | 8123, 9000 | HTTP, TCP |
| MinIO | 9000 (API), 9001 (UI) | HTTP |
| Prometheus | 9090 | HTTP |
| Grafana | 3001 | HTTP |
| Jaeger UI | 16686 | HTTP |

---

## 3. CI/CD Pipeline — GitHub Actions

### 3.1 Pipeline Overview

```
Developer Push / PR
        │
        ▼
┌──────────────────────────────────────────────────────┐
│              GitHub Actions Workflow                  │
│                                                      │
│  Trigger: push to main / PR to main                  │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Job 1: Code Quality & Tests (parallel)          │ │
│  │                                                  │ │
│  │  ┌──────────────┐  ┌──────────────┐             │ │
│  │  │ frontend-ci  │  │ backend-ci   │             │ │
│  │  │              │  │              │             │ │
│  │  │ npm ci       │  │ mvn verify   │             │ │
│  │  │ npm run lint │  │ (unit tests) │             │ │
│  │  │ npm run test │  │ jacoco report│             │ │
│  │  │ npm run build│  │              │             │ │
│  │  └──────────────┘  └──────────────┘             │ │
│  │                                                  │ │
│  │  ┌──────────────┐                               │ │
│  │  │  ai-svc-ci   │                               │ │
│  │  │              │                               │ │
│  │  │ pip install  │                               │ │
│  │  │ pytest       │                               │ │
│  │  │ ruff lint    │                               │ │
│  │  └──────────────┘                               │ │
│  └─────────────────────────────────────────────────┘ │
│                          │                            │
│                     ALL PASS                          │
│                          │                            │
│  ┌───────────────────────▼─────────────────────────┐ │
│  │  Job 2: Docker Build & Push                      │ │
│  │                                                  │ │
│  │  Matrix build (parallel per service):            │ │
│  │  · docker build -f infra/docker/Dockerfile.X .   │ │
│  │  · docker tag image:${GITHUB_SHA:0:8}            │ │
│  │  · docker push ghcr.io/netcradus/acis-X:sha      │ │
│  │  · docker push ghcr.io/netcradus/acis-X:latest   │ │
│  └─────────────────────────────────────────────────┘ │
│                          │                            │
│  ┌───────────────────────▼─────────────────────────┐ │
│  │  Job 3: Deploy to Staging                        │ │
│  │  (only on push to main)                          │ │
│  │                                                  │ │
│  │  helm upgrade --install acis-staging ./helm/acis │ │
│  │    --namespace acis-staging                      │ │
│  │    --set image.tag=${GITHUB_SHA:0:8}             │ │
│  │    --set env=staging                             │ │
│  │    --wait --timeout 5m                           │ │
│  └─────────────────────────────────────────────────┘ │
│                          │                            │
│  ┌───────────────────────▼─────────────────────────┐ │
│  │  Job 4: Smoke Tests on Staging                   │ │
│  │                                                  │ │
│  │  · curl /ai/health → 200                         │ │
│  │  · curl /api/alerts → authenticated 200          │ │
│  │  · Playwright E2E: login → dashboard loads       │ │
│  └─────────────────────────────────────────────────┘ │
│                          │                            │
│  ┌───────────────────────▼─────────────────────────┐ │
│  │  Job 5: Production Deploy (manual approval gate) │ │
│  │                                                  │ │
│  │  Requires: GitHub Environment "production"       │ │
│  │  approval from: CISO / Engineering Lead          │ │
│  │                                                  │ │
│  │  helm upgrade acis-prod ./helm/acis              │ │
│  │    --namespace acis-prod                         │ │
│  │    --set image.tag=${GITHUB_SHA:0:8}             │ │
│  │    --set env=production                          │ │
│  │    --set replicaCount=3                          │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 3.2 GitHub Actions Workflow File Structure

```yaml
# .github/workflows/ci-cd.yml

name: ACIS CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ghcr.io/netcradus

jobs:
  frontend-ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd frontend && npm ci
      - run: cd frontend && npm run lint
      - run: cd frontend && npm run test -- --passWithNoTests
      - run: cd frontend && npm run build

  backend-ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: '21', distribution: 'temurin' }
      - run: cd backend && mvn verify --no-transfer-progress

  ai-service-ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: cd ai-service && pip install -r requirements.txt
      - run: cd ai-service && pytest tests/ -v

  docker-build:
    needs: [frontend-ci, backend-ci, ai-service-ci]
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [frontend, gateway, alerts, search, correlation,
                  ingestion, soar, assets, threat-intel, reports, ai-service]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: |
            ${{ env.IMAGE_PREFIX }}/acis-${{ matrix.service }}:${{ github.sha }}
            ${{ env.IMAGE_PREFIX }}/acis-${{ matrix.service }}:latest

  deploy-staging:
    needs: docker-build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: azure/setup-helm@v3
      - run: |
          helm upgrade --install acis-staging ./infra/helm/acis \
            --namespace acis-staging \
            --create-namespace \
            --set global.imageTag=${{ github.sha }} \
            --set global.environment=staging \
            --wait --timeout 5m

  deploy-production:
    needs: deploy-staging
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production   # ← requires manual approval
    steps:
      - uses: actions/checkout@v4
      - uses: azure/setup-helm@v3
      - run: |
          helm upgrade acis-prod ./infra/helm/acis \
            --namespace acis-prod \
            --set global.imageTag=${{ github.sha }} \
            --set global.environment=production \
            --set backend.replicaCount=3 \
            --wait --timeout 10m
```

---

## 4. Docker Build — Multi-Stage Dockerfiles

### 4.1 Frontend Dockerfile

```dockerfile
# infra/docker/Dockerfile.frontend
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --frozen-lockfile
COPY frontend/ .
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine AS production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /app/dist /usr/share/nginx/html
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
USER appuser
EXPOSE 80
```

### 4.2 Spring Boot Service Dockerfile

```dockerfile
# infra/docker/Dockerfile.spring
# Stage 1: Build
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY backend/pom.xml ./
COPY backend/acis-common/pom.xml ./acis-common/
COPY backend/acis-alerts/pom.xml ./acis-alerts/
RUN mvn dependency:go-offline -pl acis-alerts -am
COPY backend/acis-common/src ./acis-common/src/
COPY backend/acis-alerts/src ./acis-alerts/src/
RUN mvn package -pl acis-alerts -am -DskipTests

# Stage 2: Runtime (JRE only)
FROM eclipse-temurin:21-jre-alpine AS production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder /app/acis-alerts/target/acis-alerts-*.jar app.jar
USER appuser
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### 4.3 AI Service Dockerfile

```dockerfile
# infra/docker/Dockerfile.ai-service
FROM python:3.11-slim AS production
RUN useradd -m -u 1000 appuser
WORKDIR /app
COPY ai-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ai-service/ .
USER appuser
EXPOSE 8090
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
```

---

## 5. Development Environment Startup Flow

```
Developer workstation
        │
        │ git clone + cd netcradus-acis
        │
        ▼
┌─────────────────────────────────────┐
│  Step 1: Start Infrastructure       │
│                                     │
│  docker compose -f infra/docker-    │
│  compose.yml up -d                  │
│                                     │
│  Starts:                            │
│  · postgres:5432                    │
│  · keycloak:8180 (imports realm)    │
│  · kafka:9092  (KRaft mode)         │
│  · elasticsearch:9200               │
│  · clickhouse:8123                  │
│  · minio:9000                       │
│  · prometheus:9090                  │
│  · grafana:3001                     │
└─────────────────┬───────────────────┘
                  │ ~60 seconds to boot
                  ▼
┌─────────────────────────────────────┐
│  Step 2: Run DB Migrations          │
│                                     │
│  scripts/migrate.sh                 │
│  → Flyway migrations on PostgreSQL  │
│  → Creates all tables + RLS         │
│  → Runs scripts/seed.sql            │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Step 3: Start Backend Services     │
│                                     │
│  backend/start_backend.ps1          │
│  → mvn spring-boot:run (per svc)    │
│  → acis-gateway  (8080)             │
│  → acis-alerts   (8081)             │
│  → acis-search   (8082)             │
│  → acis-correlation (8083)          │
│  → acis-ingestion (8084)            │
│  → acis-soar     (8085)             │
│  → acis-assets   (8086)             │
│  → acis-threat-intel (8087)         │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Step 4: Start AI Service           │
│                                     │
│  cd ai-service                      │
│  python -m uvicorn app.main:app     │
│    --port 8090 --reload             │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Step 5: Start Frontend             │
│                                     │
│  cd frontend                        │
│  npm run dev                        │
│  → Vite dev server: localhost:3000  │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Step 6: Load Seed Data             │
│                                     │
│  python scripts/seed-kafka.py       │
│  → Pushes 10,000 synthetic events   │
│  → Triggers correlation rules       │
│  → Generates alerts on dashboard    │
└─────────────────────────────────────┘

Total startup time: ~3-5 minutes
Access: http://localhost:3000
Login: admin / admin123
```

---

## 6. Kubernetes Deployment Architecture

### 6.1 Namespace Structure

```
acis-prod / acis-staging
├── Namespace: acis-frontend
│   └── frontend-deployment (nginx, 2 replicas prod)
│
├── Namespace: acis-backend
│   ├── gateway-deployment (2 replicas)
│   ├── alerts-deployment (3 replicas)
│   ├── search-deployment (2 replicas)
│   ├── correlation-deployment (2 replicas)
│   ├── ingestion-deployment (2 replicas)
│   ├── soar-deployment (2 replicas)
│   ├── assets-deployment (2 replicas)
│   ├── threat-intel-deployment (2 replicas)
│   └── reports-deployment (1 replica)
│
├── Namespace: acis-ai
│   └── ai-service-deployment (2 replicas, GPU node optional)
│
├── Namespace: acis-data
│   ├── postgres StatefulSet (primary + 1 replica)
│   ├── elasticsearch StatefulSet (3 nodes)
│   ├── kafka StatefulSet (3 brokers, KRaft)
│   ├── clickhouse StatefulSet (1 node)
│   └── minio StatefulSet (4 nodes, distributed)
│
└── Namespace: acis-monitoring
    ├── prometheus-deployment
    ├── grafana-deployment
    └── jaeger-deployment
```

### 6.2 Kubernetes Deployment Manifest Pattern

```yaml
# infra/k8s/deployments/alerts-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: acis-alerts
  namespace: acis-backend
  labels:
    app: acis-alerts
    version: "{{ .Values.global.imageTag }}"
spec:
  replicas: {{ .Values.backend.alerts.replicaCount }}
  selector:
    matchLabels:
      app: acis-alerts
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  template:
    metadata:
      labels:
        app: acis-alerts
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8081"
        prometheus.io/path: "/actuator/prometheus"
    spec:
      serviceAccountName: acis-backend-sa
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
      containers:
        - name: acis-alerts
          image: ghcr.io/netcradus/acis-alerts:{{ .Values.global.imageTag }}
          ports:
            - containerPort: 8081
          envFrom:
            - secretRef:
                name: acis-db-secret
            - configMapRef:
                name: acis-config
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8081
            initialDelaySeconds: 30
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8081
            initialDelaySeconds: 60
            periodSeconds: 30
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
```

### 6.3 Rolling Deployment Flow (Production)

```
New release triggered (GitHub Actions)
        │
        │ helm upgrade acis-prod ...
        ▼
┌──────────────────────────────────────┐
│  Kubernetes Rolling Update           │
│                                      │
│  Per service (sequential):           │
│                                      │
│  Old Pod [v1] [v1] [v1]             │
│          ↓                           │
│  Spin up [v2] beside old            │
│          ↓                           │
│  [v1] [v1] [v1] [v2]               │
│          ↓                           │
│  Readiness probe passes for [v2]    │
│          ↓                           │
│  Terminate 1x [v1]                  │
│          ↓                           │
│  [v1] [v1] [v2]                     │
│          ↓                           │
│  Repeat until all pods = [v2]       │
│          ↓                           │
│  [v2] [v2] [v2] ✓                  │
│                                      │
│  maxUnavailable: 0 (zero downtime)  │
└──────────────────────────────────────┘
        │
        ▼
Helm post-hook: smoke test
        │
        ├── PASS → deployment complete ✓
        │
        └── FAIL → automatic rollback
                    helm rollback acis-prod
```

---

## 7. Helm Chart Structure

```
infra/helm/acis/
├── Chart.yaml
├── values.yaml                # Default values
├── values.staging.yaml        # Staging overrides
├── values.production.yaml     # Production overrides
└── templates/
    ├── _helpers.tpl
    ├── namespaces.yaml
    ├── configmap.yaml
    ├── secrets.yaml
    ├── frontend/
    │   ├── deployment.yaml
    │   ├── service.yaml
    │   └── ingress.yaml
    ├── backend/
    │   ├── gateway/
    │   ├── alerts/
    │   ├── search/
    │   ├── correlation/
    │   ├── ingestion/
    │   ├── soar/
    │   ├── assets/
    │   ├── threat-intel/
    │   └── reports/
    ├── ai-service/
    │   ├── deployment.yaml
    │   └── service.yaml
    ├── monitoring/
    │   ├── prometheus.yaml
    │   └── grafana.yaml
    └── network-policies/
        └── backend-isolation.yaml
```

### 7.1 values.yaml (Key Sections)

```yaml
global:
  imageTag: latest
  imageRegistry: ghcr.io/netcradus
  environment: production

frontend:
  replicaCount: 2
  service:
    type: ClusterIP
    port: 80
  ingress:
    enabled: true
    host: acis.netcradus.com
    tlsSecret: acis-tls

backend:
  alerts:
    replicaCount: 3
    resources:
      requests: { cpu: 250m, memory: 512Mi }
      limits: { cpu: 1, memory: 1Gi }
  gateway:
    replicaCount: 2
  soar:
    replicaCount: 2

aiService:
  replicaCount: 2
  resources:
    requests: { cpu: 500m, memory: 2Gi }
    limits: { cpu: 4, memory: 8Gi }

kafka:
  brokers: 3
  retentionHours: 168  # 7 days
  replicationFactor: 3

elasticsearch:
  nodes: 3
  heapSize: 2g
  storageSize: 500Gi

postgres:
  storageSize: 100Gi
  backupSchedule: "0 2 * * *"  # 2am daily
```

---

## 8. Data Backup & Disaster Recovery

### 8.1 Backup Strategy

| Data Store | Backup Method | Frequency | Retention |
|---|---|---|---|
| PostgreSQL | pg_dump → MinIO | Every 6 hours | 30 days |
| Elasticsearch | Snapshot API → S3 | Daily | 14 days |
| MinIO Reports | Cross-region replication | Continuous | 90 days |
| ClickHouse | Table backup → S3 | Daily | 14 days |
| Kafka | Offsets + topic config | On change | N/A |

### 8.2 Recovery Time Objectives

| Scenario | RTO | RPO |
|---|---|---|
| Single pod crash | < 30 sec (K8s restart) | 0 (stateless) |
| Node failure | < 2 min (rescheduling) | 0 (stateless) |
| DB primary failure | < 5 min (failover) | < 6 hours |
| Full cluster failure | < 30 min (helm reinstall) | < 6 hours |
| Region failure | < 4 hours (DR restore) | < 24 hours |

---

## 9. Network Topology (Production)

```
Internet
    │
    ▼
CloudFlare / CDN
    │ HTTPS (TLS 1.3)
    ▼
Load Balancer (AWS ALB / GCP LB)
    │
    ├── /        → frontend-svc (nginx, port 80)
    │
    └── /api/*   → gateway-svc (Spring Cloud Gateway, port 8080)
                      │ (validates JWT, routes internally)
                      │
                      ├──► alerts-svc:8081
                      ├──► search-svc:8082
                      ├──► correlation-svc:8083
                      ├──► ingestion-svc:8084
                      ├──► soar-svc:8085
                      ├──► assets-svc:8086
                      ├──► threat-intel-svc:8087
                      └──► reports-svc:8088
                                │ (gRPC internal)
                                └──► ai-service-svc:8090

All inter-service traffic: Kubernetes ClusterIP (no external exposure)
All services: TLS with mutual authentication (mTLS) via Istio service mesh
```

---

*Document Version 1.0 — NETCRADUS ACIS DevOps*  
