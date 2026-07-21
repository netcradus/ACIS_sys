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

# 5. Build and launch entire stack in background
sudo docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "========================================================="
echo "   SUCCESS! NETCRADUS ACIS is live on Utho Cloud!"
echo "   Access Dashboard: http://$(curl -s ifconfig.me)"
echo "   AI Service:       http://$(curl -s ifconfig.me):8090"
echo "   Keycloak SSO:     http://$(curl -s ifconfig.me):8180"
echo "========================================================="
