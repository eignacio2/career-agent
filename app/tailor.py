"""Reorder, then optionally rewrite, an existing resume for one posting.

Hard rule: never invent employers, titles, dates, metrics, or skills.
The heuristic reorders bullets. An LLM overlay may rephrase them. A facts
gate rejects the overlay if it invents anything; the heuristic pack is kept.
"""

from __future__ import annotations

import re
from typing import Any, Callable

from app import config
from app.facts import check_overlay
from app.llm import request_overlay
from app.models import Job, Profile, Resume, TailoredApplication
from app.resume_render import render_resume_markdown
from app.scoring.score import extract_job_skills

MAX_BULLETS = 4


def tokenize(text: str) -> set[str]:
    cleaned = re.sub(r"[^a-z0-9+#. ]", " ", text.lower())
    return {word for word in cleaned.split() if len(word) > 3}


def relevance_score(bullet: str, job_tokens: set[str], job_skills: list[str]) -> float:
    lowered = bullet.lower()
    skill_hits = sum(3 for skill in job_skills if skill in lowered)
    token_hits = sum(1 for word in tokenize(bullet) if word in job_tokens)
    has_metric = 1.5 if re.search(r"\d", bullet) else 0
    return skill_hits + token_hits + has_metric


def select_bullets(resume: Resume, job: Job) -> dict[str, list[str]]:
    job_tokens = tokenize(f"{job.title} {job.description}")
    job_skills = extract_job_skills(job)
    selection: dict[str, list[str]] = {}
    for role in resume.experience:
        ranked = sorted(
            [
                (relevance_score(bullet, job_tokens, job_skills), index, bullet)
                for index, bullet in enumerate(role.bullets)
            ],
            key=lambda item: (-item[0], item[1]),
        )
        kept = sorted(ranked[:MAX_BULLETS], key=lambda item: item[1])
        selection[role.id] = [bullet for _, _, bullet in kept]
    return selection


def matched_skills(resume: Resume, profile: Profile, job: Job) -> list[str]:
    owned = {
        skill.lower()
        for skill in [
            *profile.skills,
            *[item for group in resume.skill_groups for item in group.items],
            *[item for role in resume.experience for item in role.stack],
        ]
    }
    return [skill for skill in extract_job_skills(job, owned) if skill.lower() in owned]


def _heuristic_summary(job: Job, profile: Profile, overlap: list[str], resume: Resume) -> str:
    focus = ", ".join(overlap[:5])
    if profile.experience_level == "new-grad":
        base = f"New-grad candidate targeting the {job.title} role at {job.company}."
    else:
        base = (
            f"{profile.years_experience}+ years of relevant work, targeting the "
            f"{job.title} role at {job.company}."
        )
    if resume.experience:
        role = resume.experience[0]
        if role.company:
            base += f" Most recent work: {role.role} at {role.company}."
        elif role.role:
            base += f" Most recent work: {role.role}."
    if focus:
        return f"{base} Overlap with this posting: {focus}."
    return base


def _as_clause(bullet: str) -> str:
    trimmed = bullet.strip()
    body = trimmed[:1].lower() + trimmed[1:]
    return body if body.endswith(".") else f"{body}."


def _cover_letter(
    job: Job,
    profile: Profile,
    resume: Resume,
    bullets: dict[str, list[str]],
    overlap: list[str],
) -> str:
    recent = resume.experience[0] if resume.experience else None
    best = [bullet for group in bullets.values() for bullet in group][:3]
    skill_line = ", ".join(overlap[:4])
    self_description = profile.headline.split("·")[0].strip() or "new-grad CS student"

    paragraphs = [
        f"Dear {job.company} hiring team,",
        (
            f"I am applying for the {job.title} role. I am a {self_description}, "
            f"and the part of this posting that stands out is "
            f"{'the emphasis on ' + skill_line if skill_line else 'the chance to own production systems rather than notebook prototypes'}."
        ),
    ]
    if recent and best:
        where = f" at {recent.company}" if recent.company else ""
        paragraphs.append(f"As {recent.role}{where}, I {_as_clause(best[0])}")
    if len(best) > 1:
        extra = f"I {_as_clause(best[1])}"
        if len(best) > 2:
            extra += f" And I {_as_clause(best[2])}"
        paragraphs.append(f"Two other pieces of that work map onto this role. {extra}")
    github = f", and my code is at {profile.github_url}" if profile.github_url else ""
    paragraphs.append(
        f"I would welcome the chance to talk through how this applies to what your team is building. "
        f"My resume is below{github}."
    )
    contact = profile.email + (f" · {profile.phone}" if profile.phone else "")
    paragraphs.append(f"Thank you for your time,\n{profile.full_name}\n{contact}")
    return "\n\n".join(paragraphs)


def default_notes(overlap: list[str], bullets: dict[str, list[str]]) -> list[str]:
    kept = sum(len(items) for items in bullets.values())
    return [
        (
            f"Promoted {', '.join(overlap[:6])} to the top of the skills section to match the posting."
            if overlap
            else "No named technology overlap found, so the resume kept its default skill order."
        ),
        f"Kept the {kept} most relevant bullets and dropped the rest so the page stays skimmable.",
        "Retitled the header to the posting title so keyword screens match. No employers or metrics were invented.",
    ]


def _render(
    job: Job,
    profile: Profile,
    resume: Resume,
    overlap: list[str],
    bullets: dict[str, list[str]],
    summary: str,
    cover_letter: str,
    notes: list[str],
    generated_by: str,
) -> TailoredApplication:
    return TailoredApplication(
        resume_markdown=render_resume_markdown(
            resume,
            summary=summary,
            bullets_by_experience_id=bullets,
            priority_skills=overlap,
            target_title=job.title,
        ),
        cover_letter=cover_letter,
        notes=notes,
        generated_by=generated_by,
    )


def tailor_application(
    job: Job,
    profile: Profile,
    resume: Resume,
    complete: Callable[[str, str], dict[str, Any] | None] | None = None,
) -> TailoredApplication:
    overlap = matched_skills(resume, profile, job)
    bullets = select_bullets(resume, job)
    summary = _heuristic_summary(job, profile, overlap, resume)
    cover = _cover_letter(job, profile, resume, bullets, overlap)
    notes = default_notes(overlap, bullets)
    heuristic = _render(job, profile, resume, overlap, bullets, summary, cover, notes, "heuristic")

    should_overlay = complete is not None or config.llm_configured()
    if not should_overlay:
        notes.append("LLM overlay skipped (no OPENAI_API_KEY / local OPENAI_BASE_URL).")
        return heuristic.model_copy(update={"notes": notes})

    draft = request_overlay(job, profile, resume, bullets, overlap, complete=complete)
    if draft is None:
        notes.append("LLM overlay skipped (no JSON response); used the heuristic pack.")
        return heuristic.model_copy(update={"notes": notes})

    ok, reason = check_overlay(
        resume=resume,
        profile=profile,
        job=job,
        original_bullets=bullets,
        draft=draft,
    )
    if not ok:
        notes.append(f"LLM overlay rejected: {reason}. Used the heuristic pack.")
        return heuristic.model_copy(update={"notes": notes})

    merged_bullets = dict(bullets)
    merged_bullets.update(draft.bullets_by_experience_id)
    overlay_summary = draft.summary.strip() or summary
    overlay_notes = notes + [
        "LLM overlay rewrote the summary, bullets, and cover letter.",
        "Facts gate passed: no new employers, metrics, or skills.",
    ]
    return _render(
        job,
        profile,
        resume,
        overlap,
        merged_bullets,
        overlay_summary,
        draft.cover_letter.strip(),
        overlay_notes,
        "llm",
    )
