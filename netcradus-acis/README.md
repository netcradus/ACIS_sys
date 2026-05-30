# NETCRADUS ACIS - Advanced Cyber Intelligence System

NETCRADUS ACIS is a high-performance, distributed security operations platform designed for real-time log ingestion, forensic search, asset management, and threat intelligence correlation.

## 🏗 System Architecture

The system follows a microservices architecture managed via a centralized API Gateway:

- **acis-gateway**: Central entry point (Port 8080) handling routing and JWT verification.
- **acis-log-service**: Ingests logs from Kafka, stores in Elasticsearch, and broadcasts via WebSockets.
- **acis-asset-service**: Manages corporate assets, identities, and network blocks.
- **acis-threat-service**: Aggregates Indicators of Compromise (IoC) and threat feeds.
- **ai-service**: Python-based AI microservice providing Machine Learning for log anomaly detection, NLP SPL translation, and Threat Intel enrichment via REST and gRPC.
- **Infrastructure**: Fully containerized environment using Docker Compose.

## 🛠 Technology Stack

- **Backend**: Java 21, Spring Boot 3.3, Spring Cloud Gateway, Spring Data (JPA, Elasticsearch).
- **AI/ML**: Python 3.10+, FastAPI, gRPC, Scikit-learn, XGBoost, Sentence-Transformers.
- **Frontend**: React (Vite), TypeScript, Tailwind CSS, AG Grid (v31).
- **Data Layers**: Elasticsearch (Hot Logs), ClickHouse (Analytics), PostgreSQL (System Data), Kafka (Buffering).
- **Security**: Keycloak (OIDC/OAuth2).
- **Observability**: Prometheus, Grafana, Micrometer.

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have the following installed:
- **Docker & Docker Compose**
- **Java 21 (JDK)**
- **Maven 3.9+**
- **Node.js 18+ & npm**
- **Python 3.10+**

### 2. Infrastructure Setup
Spin up the core database, messaging, and security services:

```bash
cd infra
docker-compose up -d
```
*Wait approximately 60-90 seconds for all services (especially Keycloak and Kafka) to reach a healthy state.*

### 3. AI Service Setup
The Python AI service handles NLP translation, anomaly detection, and IOC enrichment. It runs both a FastAPI REST server and a gRPC server simultaneously.

```bash
cd ai-service
python -m venv venv

# Activate virtual environment
# Windows:
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

pip install -r requirements.txt
python app/main.py
```

### 4. Backend Implementation
Build and run the microservices using Maven:

```bash
cd backend
mvn clean install -DskipTests

# Open separate terminals for each runnable service:
mvn spring-boot:run -pl acis-gateway '-Dspring-boot.run.jvmArguments="-Xms128m -Xmx256m"'
mvn spring-boot:run -pl acis-log-service '-Dspring-boot.run.jvmArguments="-Xms128m -Xmx256m"'
mvn spring-boot:run -pl acis-alerts '-Dspring-boot.run.jvmArguments="-Xms128m -Xmx256m"'
mvn spring-boot:run -pl acis-asset-service '-Dspring-boot.run.jvmArguments="-Xms128m -Xmx256m"'
mvn spring-boot:run -pl acis-threat-service '-Dspring-boot.run.jvmArguments="-Xms128m -Xmx256m"'
mvn spring-boot:run -pl acis-correlation '-Dspring-boot.run.jvmArguments="-Xms128m -Xmx256m"'
```

> **Note:** `acis-ingestion` exists as a module directory but is not yet registered in the parent `pom.xml`. Add it to the `<modules>` section before running it.

### 5. Frontend Launch
Initialize the React dashboard:

```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the ACIS Dashboard.

---

## 🔒 Security Configuration
The system uses **Keycloak** for Identity Management.
- **Admin Console**: [http://localhost:8180](http://localhost:8180) (Admin/Admin)
- **Realm**: `acis`
- **Default User**: See `infra/keycloak/realm-acis.json` for seed users.

## 📡 Service Ports
| Service | Module | Port | Description |
| :--- | :--- | :--- | :--- |
| Gateway | `acis-gateway` | 8080 | Central API Access & JWT Verification |
| Alerts | `acis-alerts` | 8081 | Real-time Alerts & Incident Management |
| Log Service | `acis-log-service` | 8082 | SPL Search, Log Explorer & Ingestion |
| Correlation | `acis-correlation` | 8083 | Rule Engine & Event Correlation |
| Asset Service | `acis-asset-service` | 8086 | CMDB & Asset Tracking |
| Threat Service | `acis-threat-service` | 8087 | Threat Intelligence Feeds |
| AI Service | `ai-service` | 8090 / 50051 | FastAPI REST / gRPC ML Endpoints |
| Keycloak | *(infra)* | 8180 | Identity & Access Management |

**Infrastructure Services**
| Service | Port | Description |
| :--- | :--- | :--- |
| Elasticsearch | 9200 | Log Storage |
| Kafka | 9092 | Event Streaming |
| Grafana | 3001 | Observability Dashboards |

---

## 🛠 Active Development Commands
- **Mock Data Generation**: The Log Service includes a `MockLogGenerator` that automatically pushes security traffic to Kafka every 3 seconds for demonstration purposes.
- **Grid Testing**: AG Grid uses a `calc()` based responsive height to ensure visibility across varying viewport sizes.

---
© 2026 NETCRADUS ACIS - Advanced agentic security monitoring.
