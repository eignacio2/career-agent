#!/usr/bin/env bash
#
# Triggers one agent run against a running instance.
#
#   0 13 * * * /path/to/career-agent/scripts/run_daily.sh >> /tmp/career-agent.log 2>&1
#
# Environment:
#   APP_URL      Defaults to http://127.0.0.1:43421
#   CRON_SECRET  Sent as a bearer token when the app requires one.

set -euo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:43421}"
ENDPOINT="${APP_URL%/}/api/cron/daily"

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] triggering ${ENDPOINT}"

if [ -n "${CRON_SECRET:-}" ]; then
  curl --fail-with-body --silent --show-error --max-time 600 \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -X POST "${ENDPOINT}"
else
  curl --fail-with-body --silent --show-error --max-time 600 \
    -X POST "${ENDPOINT}"
fi

echo
