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

def llm_settings() -> tuple[str, str, str]:
    """key, base_url, model — read on each call so a new env var is picked up."""
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
    return key, base, model


def llm_configured() -> bool:
    """True when a rewrite overlay can be attempted.

    A vendor key is enough. A non-OpenAI base URL is enough for a local
    server (Ollama) that does not need a key. Default OpenAI with no key
    is not configured — the heuristic tailor still runs.
    """
    key, base, _ = llm_settings()
    if key:
        return True
    return bool(base) and base != "https://api.openai.com/v1"
