"""Facts gate for LLM rewrites.

The overlay may rephrase. It may not add employers, schools, metrics, or
skills that are not already on the source resume (or, for the letter, the
posting it is applying to). A failed check discards the whole overlay.
"""

from __future__ import annotations

import re

from app.models import Job, OverlayDraft, Profile, Resume, SourceJob
from app.scoring.score import SKILL_VOCABULARY, extract_job_skills

COMPANY_CUE = re.compile(
    r"\b(?:at|from|join(?:ing)?|with)\s+([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,4})",
)
NUMBER_RE = re.compile(r"\$\d[\d,]*(?:\.\d+)?|\b\d+(?:\.\d+)?%|\b\d{2,}(?:\.\d+)?\b")


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _source_blob(resume: Resume) -> str:
    parts = [
        resume.basics.name,
        resume.basics.title,
        resume.basics.summary,
        resume.basics.location,
        *resume.certifications,
    ]
    for group in resume.skill_groups:
        parts.extend(group.items)
    for role in resume.experience:
        parts.extend([role.company, role.role, role.location, role.start, role.end, *role.bullets, *role.stack])
    for project in resume.projects:
        parts.extend([project.name, project.description, *project.stack])
    for edu in resume.education:
        parts.extend([edu.school, edu.degree, edu.detail, edu.start, edu.end])
    return "\n".join(part for part in parts if part)


def _orgs(resume: Resume, profile: Profile, job: Job) -> list[str]:
    names = [
        resume.basics.name,
        profile.full_name,
        job.company,
        job.location,
        profile.location,
    ]
    for role in resume.experience:
        names.append(role.company)
    for edu in resume.education:
        names.append(edu.school)
    return [name for name in names if name and name.strip()]


def _owned_skills(resume: Resume, profile: Profile) -> set[str]:
    owned = {skill.lower() for skill in profile.skills}
    for group in resume.skill_groups:
        owned.update(item.lower() for item in group.items)
    for role in resume.experience:
        owned.update(item.lower() for item in role.stack)
    return owned


def _skills_mentioned(text: str) -> list[str]:
    fake = SourceJob(
        source="facts",
        source_id="facts",
        title="",
        company="",
        url="https://example.invalid",
        description=text,
    )
    return extract_job_skills(fake, SKILL_VOCABULARY)


def _numbers(text: str) -> set[str]:
    return {match.group(0) for match in NUMBER_RE.finditer(text or "")}


def check_overlay(
    *,
    resume: Resume,
    profile: Profile,
    job: Job,
    original_bullets: dict[str, list[str]],
    draft: OverlayDraft,
) -> tuple[bool, str]:
    """Return (ok, reason). reason is empty when ok."""
    if not (draft.cover_letter or "").strip():
        return False, "overlay cover letter was empty"
    if not draft.bullets_by_experience_id:
        return False, "overlay returned no bullets"

    known_ids = {role.id for role in resume.experience}
    for exp_id, bullets in draft.bullets_by_experience_id.items():
        if exp_id not in known_ids:
            return False, f"overlay invented experience id {exp_id}"
        original = original_bullets.get(exp_id, [])
        cleaned = [item.strip() for item in bullets if str(item).strip()]
        if len(cleaned) > len(original):
            return False, f"overlay added extra bullets to {exp_id}"
        if original and not cleaned:
            return False, f"overlay dropped all bullets for {exp_id}"

    rewrite_bits = [draft.summary, draft.cover_letter]
    for bullets in draft.bullets_by_experience_id.values():
        rewrite_bits.extend(bullets)
    rewrite = "\n".join(rewrite_bits)

    source = _source_blob(resume)
    original_text = "\n".join(bullet for group in original_bullets.values() for bullet in group)
    allowed_numbers = _numbers(source) | _numbers(original_text) | _numbers(job.description or "") | _numbers(job.salary_text or "")
    invented_numbers = sorted(_numbers(rewrite) - allowed_numbers)
    if invented_numbers:
        return False, f"overlay invented metric(s): {', '.join(invented_numbers)}"

    owned = _owned_skills(resume, profile)
    allowed_skills = set(owned)
    allowed_skills.update(skill.lower() for skill in _skills_mentioned(original_text))
    allowed_skills.update(skill.lower() for skill in _skills_mentioned(job.description or ""))
    allowed_skills.update(skill.lower() for skill in job.tags)
    for skill in _skills_mentioned(rewrite):
        if skill.lower() not in allowed_skills:
            return False, f"overlay invented skill {skill}"

    known = _orgs(resume, profile, job)
    known_norm = {_norm(name) for name in known}
    # Locations, filler, and skill names are not orgs ("with Gemini", "at FastAPI").
    skip = {_norm(word) for word in ("the", "our", "this", "remote", "hybrid", "university", "team")}
    skip.update(_norm(skill) for skill in SKILL_VOCABULARY)
    skip.update(_norm(skill) for skill in owned)
    for match in COMPANY_CUE.finditer(rewrite):
        name = match.group(1).strip().rstrip(".,;:")
        if len(name) < 3:
            continue
        token = _norm(name)
        if not token or token in skip:
            continue
        if any(token == k or token in k or k in token for k in known_norm if k):
            continue
        return False, f"overlay invented employer or school {name}"

    return True, ""
