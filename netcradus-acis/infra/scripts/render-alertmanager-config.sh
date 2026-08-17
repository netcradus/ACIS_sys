#!/bin/sh
# Renders infra/monitoring/alertmanager.yml.template ->
# infra/monitoring/alertmanager.yml using real values from .env. Run
# standalone to re-render after editing .env (e.g. rotating the SMTP
# password) without a full redeploy, or via infra/scripts/deploy.sh which
# calls this automatically.
#
# Alertmanager's own config format has no environment-variable
# interpolation (unlike docker-compose.yml or nginx's built-in templating),
# so this substitution has to happen before the file reaches the container -
# same reasoning as .env.prod.example -> .env, just at the Alertmanager
# config layer instead of the compose layer.
set -eu

cd "$(dirname "$0")/../.."

if [ ! -f .env ]; then
  echo "[render-alertmanager-config] FAILED: no .env file found. Copy .env.prod.example to .env and fill in real values first." >&2
  exit 1
fi

# Only the specific vars this template needs, exported into this script's
# own environment - not a blanket `set -a; . ./.env` of the whole file,
# since .env may contain values with characters that don't round-trip
# safely through `.` sourcing in every shell.
get_env_value() {
  # Last matching, non-comment "KEY=value" line for $1, value unquoted.
  grep -E "^${1}=" .env | tail -n 1 | cut -d= -f2- || true
}

SMTP_HOST=$(get_env_value SMTP_HOST)
SMTP_PORT=$(get_env_value SMTP_PORT)
SMTP_USERNAME=$(get_env_value SMTP_USERNAME)
SMTP_PASSWORD=$(get_env_value SMTP_PASSWORD)
MAIL_FROM_EMAIL=$(get_env_value MAIL_FROM_EMAIL)
ALERTMANAGER_ALERT_EMAIL=$(get_env_value ALERTMANAGER_ALERT_EMAIL)
ALERTMANAGER_SLACK_WEBHOOK_URL=$(get_env_value ALERTMANAGER_SLACK_WEBHOOK_URL)

for required in SMTP_HOST SMTP_USERNAME SMTP_PASSWORD MAIL_FROM_EMAIL ALERTMANAGER_ALERT_EMAIL; do
  eval "val=\${$required:-}"
  if [ -z "$val" ]; then
    echo "[render-alertmanager-config] FAILED: $required is not set in .env — Alertmanager cannot send real notifications without it." >&2
    exit 1
  fi
done
SMTP_PORT="${SMTP_PORT:-465}"

TMP="infra/monitoring/alertmanager.yml.rendering"
cp infra/monitoring/alertmanager.yml.template "$TMP"

# Simple, portable single-value substitutions (no envsubst dependency -
# not guaranteed present on every minimal Linux host).
sed -i \
  -e "s|\${SMTP_HOST}|${SMTP_HOST}|g" \
  -e "s|\${SMTP_PORT}|${SMTP_PORT}|g" \
  -e "s|\${SMTP_USERNAME}|${SMTP_USERNAME}|g" \
  -e "s|\${SMTP_PASSWORD}|${SMTP_PASSWORD}|g" \
  -e "s|\${MAIL_FROM_EMAIL}|${MAIL_FROM_EMAIL}|g" \
  -e "s|\${ALERTMANAGER_ALERT_EMAIL}|${ALERTMANAGER_ALERT_EMAIL}|g" \
  "$TMP"

if [ -n "${ALERTMANAGER_SLACK_WEBHOOK_URL:-}" ]; then
  echo "[render-alertmanager-config] ALERTMANAGER_SLACK_WEBHOOK_URL is set — adding a Slack receiver alongside email."
  sed -i "s|__SLACK_CONFIGS_LINE__|slack_configs: [{api_url: '${ALERTMANAGER_SLACK_WEBHOOK_URL}', channel: '#acis-alerts', send_resolved: true}]|" "$TMP"
else
  sed -i "/__SLACK_CONFIGS_LINE__/d" "$TMP"
fi

mv "$TMP" infra/monitoring/alertmanager.yml
echo "[render-alertmanager-config] Wrote infra/monitoring/alertmanager.yml"
