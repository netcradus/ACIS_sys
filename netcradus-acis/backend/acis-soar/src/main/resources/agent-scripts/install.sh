#!/usr/bin/env bash
#
# ACIS Lightweight Heartbeat Agent - Linux Installer
#
# Registers this machine with ACIS Security by:
#   1. Generating (or reusing) a local agent identity at /etc/acis/agent_id
#   2. Writing a standalone heartbeat script to /etc/acis/heartbeat.sh
#   3. Installing a cron entry that runs it every minute, indefinitely, so
#      this host keeps showing up in Settings > Agent Deployment as long as
#      the machine is on.
#
# This is a lightweight presence/inventory agent, not a full EDR: it
# reports hostname/OS/IP on an interval and nothing else. Run as root
# (matches the `sudo bash -s --` invocation in the install command).
set -euo pipefail

TOKEN=""
SERVER=""
for arg in "$@"; do
  case $arg in
    --token=*) TOKEN="${arg#*=}" ;;
    --server=*) SERVER="${arg#*=}" ;;
  esac
done

if [ -z "$TOKEN" ] || [ -z "$SERVER" ]; then
  echo "Usage: install.sh --token=<enrollment_token> --server=<gateway_url>" >&2
  exit 1
fi

INSTALL_DIR=/etc/acis
AGENT_ID_FILE="$INSTALL_DIR/agent_id"
HEARTBEAT_SCRIPT="$INSTALL_DIR/heartbeat.sh"

mkdir -p "$INSTALL_DIR"

if [ -f "$AGENT_ID_FILE" ]; then
  AGENT_ID=$(cat "$AGENT_ID_FILE")
else
  if command -v uuidgen >/dev/null 2>&1; then
    AGENT_ID=$(uuidgen)
  else
    AGENT_ID=$(cat /proc/sys/kernel/random/uuid)
  fi
  echo -n "$AGENT_ID" > "$AGENT_ID_FILE"
fi

cat > "$HEARTBEAT_SCRIPT" <<EOF
#!/usr/bin/env bash
AGENT_ID=\$(cat "$AGENT_ID_FILE" 2>/dev/null || echo "$AGENT_ID")
HOSTNAME_VAL=\$(hostname)
OS_VAL=\$( ( . /etc/os-release 2>/dev/null && echo "\$PRETTY_NAME" ) || uname -sr)
IP_VAL=\$(hostname -I 2>/dev/null | awk '{print \$1}')

curl -sS -X POST "$SERVER/api/agent/heartbeat" \\
  -H "Content-Type: application/json" \\
  -H "X-Agent-Token: $TOKEN" \\
  -d "{\\"agentId\\":\\"\$AGENT_ID\\",\\"hostname\\":\\"\$HOSTNAME_VAL\\",\\"os\\":\\"\$OS_VAL\\",\\"ipAddress\\":\\"\$IP_VAL\\",\\"agentVersion\\":\\"acis-heartbeat-sh-1.0\\"}" \\
  --max-time 15 >/dev/null 2>&1 || true
EOF
chmod +x "$HEARTBEAT_SCRIPT"

# Prove connectivity right now, before cron's first tick.
"$HEARTBEAT_SCRIPT"

CRON_LINE="* * * * * $HEARTBEAT_SCRIPT >> /var/log/acis-agent.log 2>&1"
( crontab -l 2>/dev/null | grep -v "$HEARTBEAT_SCRIPT" ; echo "$CRON_LINE" ) | crontab -

echo "ACIS agent enrolled. Agent ID: $AGENT_ID. Heartbeat scheduled every 60s via cron."
