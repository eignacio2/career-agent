#!/usr/bin/env bash
#
# Triggers one daily agent run against a running instance of the app.
#
# Add to crontab to run at 13:00 UTC each day:
#   0 13 * * * /path/to/career-agent/scripts/run-daily.sh >> /tmp/career-agent.log 2>&1
#
# Environment:
#   APP_URL      Base URL of the running app. Defaults to http://127.0.0.1:43317
#   CRON_SECRET  Sent as a bearer token when the app requires one.

set -euo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:43317}"
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
