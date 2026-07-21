#!/bin/bash
# NETCRADUS ACIS - Automated Utho Cloud Deployment Script

echo "========================================================="
echo "   NETCRADUS ACIS - Utho Cloud One-Click Installer"
echo "========================================================="

# 1. System Updates & Prerequisites
sudo apt-get update -y
sudo apt-get install -y curl git docker.io docker-compose-v2

# 2. Enable Docker service
sudo systemctl enable --now docker

# 3. Increase max virtual memory for Elasticsearch
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf

# 4. Navigate to netcradus-acis directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

# 5. Require a real .env before launching — docker-compose.prod.yml has no
#    baked-in secrets or demo passwords, so this file must exist and be filled
#    in (see .env.prod.example) before the stack can start.
if [ ! -f .env ]; then
  echo ""
  echo "ERROR: .env not found."
  echo "  cp .env.prod.example .env"
  echo "  then edit .env with real secrets/hostnames before re-running this script."
  exit 1
fi

# 6. Build and launch entire stack in background
sudo docker compose -f docker-compose.prod.yml --env-file .env up -d --build

echo ""
echo "========================================================="
echo "   SUCCESS! NETCRADUS ACIS is live on Utho Cloud!"
echo "   Access Dashboard: http://$(curl -s ifconfig.me)"
echo "   Keycloak SSO:     http://$(curl -s ifconfig.me):8180"
echo ""
echo "   Production Keycloak does NOT auto-import the demo realm/users."
echo "   Log into the Keycloak admin console with the KEYCLOAK_ADMIN_USER /"
echo "   KEYCLOAK_ADMIN_PASSWORD from your .env to configure real tenants."
echo "========================================================="
