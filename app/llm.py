"""OpenAI-compatible chat completions for the tailor overlay.

Scoring does not use this module. No key → caller skips the overlay.
Transport is env config, same idea as SMTP vs outbox.
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable

import httpx

from app import config
from app.models import Job, OverlayDraft, Profile, Resume

CompleteFn = Callable[[str, str], dict[str, Any] | None]

SYSTEM_PROMPT = """You rewrite a job-application resume summary, experience bullets, and cover letter.
You may rephrase and reorder emphasis to match the posting.
You must not add employers, schools, job titles the candidate did not hold, metrics, or skills
that are not in ALLOWED FACTS. Do not invent numbers.
Return JSON only with keys: summary (string), cover_letter (string), bullets_by_experience_id
(object mapping experience id to an array of strings). Use only the experience ids you were given.
Do not add extra bullets beyond what you were given for each id.
"""


def complete_json(system: str, user: str) -> dict[str, Any] | None:
    """POST /chat/completions and parse a JSON object from the assistant message."""
    if not config.llm_configured():
        return None
    key, base, model = config.llm_settings()
    url = f"{base}/chat/completions"
    headers = {"Content-Type": "application/json", "User-Agent": config.USER_AGENT}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    payload = {
        "model": model,
        "temperature": 0.2,
        "max_tokens": 1600,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    try:
        with httpx.Client(timeout=45.0) as client:
            response = client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            body = response.json()
    except (httpx.HTTPError, json.JSONDecodeError, ValueError):
        return None
    content = (
        ((body.get("choices") or [{}])[0].get("message") or {}).get("content")
        if isinstance(body, dict)
        else None
    )
    if not isinstance(content, str) or not content.strip():
        return None
    return _parse_json_object(content)


def _parse_json_object(content: str) -> dict[str, Any] | None:
    text = content.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if fenced:
        text = fenced.group(1)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            data = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return None
    return data if isinstance(data, dict) else None


def request_overlay(
    job: Job,
    profile: Profile,
    resume: Resume,
    bullets: dict[str, list[str]],
    overlap: list[str],
    complete: CompleteFn | None = None,
) -> OverlayDraft | None:
    """Ask the model to rewrite the already-selected bullets and letter."""
    fn = complete or complete_json
    allowed_orgs = [profile.full_name, job.company, *[role.company for role in resume.experience], *[edu.school for edu in resume.education]]
    allowed_skills = [
        *profile.skills,
        *[item for group in resume.skill_groups for item in group.items],
        *[item for role in resume.experience for item in role.stack],
    ]
    user = json.dumps(
        {
            "posting": {
                "title": job.title,
                "company": job.company,
                "location": job.location,
                "description": (job.description or "")[:4000],
            },
            "candidate": {
                "name": profile.full_name,
                "headline": profile.headline,
                "summary": profile.summary,
                "email": profile.email,
            },
            "allowed_facts": {
                "employers_and_schools": [name for name in allowed_orgs if name],
                "skills": allowed_skills,
                "overlap_with_posting": overlap,
            },
            "selected_bullets": bullets,
            "experience": [
                {"id": role.id, "company": role.company, "role": role.role, "start": role.start, "end": role.end}
                for role in resume.experience
            ],
        },
        indent=2,
    )
    raw = fn(SYSTEM_PROMPT, user)
    if not raw:
        return None
    try:
        draft = OverlayDraft.model_validate(raw)
    except Exception:
        return None
    draft.bullets_by_experience_id = {
        exp_id: [str(item).strip() for item in items if str(item).strip()]
        for exp_id, items in draft.bullets_by_experience_id.items()
    }
    if not draft.cover_letter.strip() or not draft.bullets_by_experience_id:
        return None
    return draft
