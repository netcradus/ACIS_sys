#!/usr/bin/env bash
#
# ACIS Lightweight Heartbeat Agent - macOS Installer
#
# Registers this machine with ACIS Security by:
#   1. Generating (or reusing) a local agent identity at /etc/acis/agent_id
#   2. Writing a standalone heartbeat script to /etc/acis/heartbeat.sh
#   3. Installing a launchd LaunchDaemon that runs it every minute,
#      indefinitely (launchd, not cron, is the correct persistent-service
#      mechanism on macOS) — so this host keeps showing up in
#      Settings > Agent Deployment as long as the machine is on.
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
  echo "Usage: install-mac.sh --token=<enrollment_token> --server=<gateway_url>" >&2
  exit 1
fi

INSTALL_DIR=/etc/acis
AGENT_ID_FILE="$INSTALL_DIR/agent_id"
HEARTBEAT_SCRIPT="$INSTALL_DIR/heartbeat.sh"
PLIST_PATH=/Library/LaunchDaemons/com.acis.agent.plist

mkdir -p "$INSTALL_DIR"

if [ -f "$AGENT_ID_FILE" ]; then
  AGENT_ID=$(cat "$AGENT_ID_FILE")
else
  AGENT_ID=$(uuidgen)
  echo -n "$AGENT_ID" > "$AGENT_ID_FILE"
fi

cat > "$HEARTBEAT_SCRIPT" <<EOF
#!/usr/bin/env bash
AGENT_ID=\$(cat "$AGENT_ID_FILE" 2>/dev/null || echo "$AGENT_ID")
HOSTNAME_VAL=\$(hostname)
OS_VAL="macOS \$(sw_vers -productVersion 2>/dev/null) (\$(uname -m))"
IP_VAL=\$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")

curl -sS -X POST "$SERVER/api/agent/heartbeat" \\
  -H "Content-Type: application/json" \\
  -H "X-Agent-Token: $TOKEN" \\
  -d "{\\"agentId\\":\\"\$AGENT_ID\\",\\"hostname\\":\\"\$HOSTNAME_VAL\\",\\"os\\":\\"\$OS_VAL\\",\\"ipAddress\\":\\"\$IP_VAL\\",\\"agentVersion\\":\\"acis-heartbeat-mac-1.0\\"}" \\
  --max-time 15 >/dev/null 2>&1 || true
EOF
chmod +x "$HEARTBEAT_SCRIPT"

# Prove connectivity right now, before launchd's first tick.
"$HEARTBEAT_SCRIPT"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.acis.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>$HEARTBEAT_SCRIPT</string>
  </array>
  <key>StartInterval</key>
  <integer>60</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/var/log/acis-agent.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/acis-agent.log</string>
</dict>
</plist>
EOF

chown root:wheel "$PLIST_PATH"
chmod 644 "$PLIST_PATH"
launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl load "$PLIST_PATH"

echo "ACIS agent enrolled. Agent ID: $AGENT_ID. Heartbeat scheduled every 60s via launchd."
