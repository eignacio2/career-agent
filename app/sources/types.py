"""Shared helpers for job-board adapters."""

from __future__ import annotations

import html
import re
from typing import Any, Protocol

import httpx

from app.config import USER_AGENT
from app.models import SourceJob

HTML_ENTITIES = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&mdash;": "—",
    "&ndash;": "–",
    "&rsquo;": "’",
    "&lsquo;": "‘",
    "&hellip;": "…",
}

EMAIL_PATTERN = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", re.I)
APPLY_CONTEXT = re.compile(
    r"(apply|send|email|resume|cv|submit|contact)[^\n]{0,120}?"
    r"([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})",
    re.I,
)
NO_REPLY = ("no-reply", "noreply", "donotreply", "example.com", "sentry.io")


class JobSource(Protocol):
    id: str
    label: str
    requires_network: bool

    def fetch(self, queries: list[str], limit: int) -> list[SourceJob]: ...


def strip_html(input_text: str, max_length: int = 6000) -> str:
    text = re.sub(r"<\s*(br|/p|/li|/div|/h[1-6])\s*/?>", "\n", input_text, flags=re.I)
    text = re.sub(r"<\s*li[^>]*>", "• ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), text)
    text = re.sub(
        r"&[a-z#0-9]+;",
        lambda m: HTML_ENTITIES.get(m.group(0).lower(), " "),
        text,
        flags=re.I,
    )
    text = html.unescape(text)
    text = re.sub(r"[ \t\u00a0]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return f"{text[:max_length]}…" if len(text) > max_length else text


def find_apply_email(text: str) -> str | None:
    context = APPLY_CONTEXT.search(text)
    candidate = context.group(2) if context else None
    if not candidate:
        match = EMAIL_PATTERN.search(text)
        candidate = match.group(0) if match else None
    if not candidate:
        return None
    lowered = candidate.lower()
    if any(needle in lowered for needle in NO_REPLY):
        return None
    return lowered


def fetch_json(
    url: str,
    timeout_s: float = 12.0,
    params: dict[str, Any] | None = None,
    extra_headers: dict[str, str] | None = None,
) -> Any | None:
    headers = {
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }
    if extra_headers:
        headers.update(extra_headers)
    try:
        response = httpx.get(
            url,
            headers=headers,
            params=params,
            timeout=timeout_s,
            follow_redirects=True,
        )
        if response.status_code != 200:
            return None
        return response.json()
    except (httpx.HTTPError, ValueError):
        return None


def partial_match(haystack: str, needle: str) -> bool:
    words = [word for word in needle.split() if len(word) > 3]
    return len(words) > 1 and all(word in haystack for word in words)


def matches_query(title: str, queries: list[str]) -> bool:
    lowered = title.lower()
    for query in queries:
        needle = query.lower().strip()
        if not needle:
            continue
        if needle in lowered:
            return True
        if partial_match(lowered, needle):
            return True
    return False
