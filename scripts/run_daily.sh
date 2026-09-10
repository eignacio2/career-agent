#!/usr/bin/env bash
# Daily run. Prefer this over curling the web server.
#
#   0 13 * * * /path/to/career-agent/scripts/run_daily.sh >> /tmp/career-agent.log 2>&1

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="${ROOT}/.venv/bin:/usr/local/bin:$PATH"
python -m app run
