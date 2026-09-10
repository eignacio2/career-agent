"""Runtime configuration.

Environment variables are the only input. Nothing here should require a
rebuild; changing .env and restarting the process is enough.
"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("CAREER_AGENT_DATA", ROOT / ".data"))
DB_PATH = Path(os.environ.get("CAREER_AGENT_DB", DATA_DIR / "career-agent.db"))

OFFLINE = os.environ.get("CAREER_AGENT_OFFLINE", "").strip() == "1"
CRON_SECRET = os.environ.get("CRON_SECRET", "").strip()
APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://127.0.0.1:43421").rstrip("/")

# Bind to an uncommon port so a leftover Next.js process on 3000/43317
# cannot steal traffic during the rewrite.
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "43421"))

USER_AGENT = "career-agent/2.0 (personal job-search assistant)"
DEFAULT_LIMIT_PER_SOURCE = 25
