# NETCRADUS ACIS — Local Development Orchestrator
$root = $PSScriptRoot

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   NETCRADUS ACIS - Local Orchestrator"
Write-Host "==============================================" -ForegroundColor Cyan

# 1. Verify backing services are running
Write-Host "Checking backing services (Postgres, Keycloak, etc.)..."
$containers = docker ps --format "{{.Names}}"
if ($containers -match "infra-postgres" -and $containers -match "infra-keycloak") {
    Write-Host "Backing services are up and running!" -ForegroundColor Green
} else {
    Write-Host "Backing services are not running. Starting them via Docker Compose..." -ForegroundColor Yellow
    cd "$root\infra"
    docker compose up -d
    Write-Host "Waiting 20 seconds for databases, brokers, and SSO to initialize..."
    Start-Sleep -Seconds 20
}

# 2. Build Java microservices
Write-Host "Stopping any running local Java processes to release file locks..." -ForegroundColor Yellow
Stop-Process -Name java -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "Building Java backend microservices (Maven)..." -ForegroundColor Cyan
cd "$root\backend"
..\apache-maven-3.9.9\bin\mvn.cmd clean install -DskipTests
if ($LASTEXITCODE -ne 0) {
    Write-Host "Java backend build failed! Aborting." -ForegroundColor Red
    exit 1
}
Write-Host "Java backend built successfully!" -ForegroundColor Green

# 3. Start Backend Services
Write-Host "Launching Java backend microservices..." -ForegroundColor Cyan
& "$root\backend\start_backend_powershell.ps1"

# 4. Start Python AI Service in a new window
Write-Host "Launching Python AI Service in a new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\ai-service'; Write-Host 'Starting AI Service...'; .\venv\Scripts\python.exe app/main.py"

# 5. Start Frontend Service in a new window
Write-Host "Launching React Frontend in a new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; Write-Host 'Installing dependencies and starting frontend dev server...'; npm install; npm run dev"

Write-Host "==============================================" -ForegroundColor Green
Write-Host "   All services are launching!" -ForegroundColor Green
Write-Host "   - Main App Panel: http://localhost:3000"
Write-Host "   - Keycloak Admin Console: http://localhost:8180 (Admin/Admin)"
Write-Host "   Check log files (*-out.log / *-err.log) under the backend/ folder for backend output."
Write-Host "==============================================" -ForegroundColor Green
