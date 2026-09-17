"""Parse a pasted resume into the structured Resume the rest of the agent uses.

The parser extracts; it does not invent. A company name appears on the stored
resume only if it appeared in the paste. Unparseable text is kept as summary
so facts are not dropped on the floor.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.models import (
    Resume,
    ResumeBasics,
    ResumeEducation,
    ResumeExperience,
    ResumeProject,
    ResumeSkillGroup,
    SourceJob,
)
from app.scoring.score import SKILL_VOCABULARY, extract_job_skills

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}")
URL_RE = re.compile(r"https?://[^\s)<>]+")
MD_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^)]+)\)")
YEAR_RE = re.compile(r"\b((?:19|20)\d{2})\b")
BULLET_RE = re.compile(r"^\s*(?:[-*•·]|\d+[.)])\s+")
HEADING_RE = re.compile(r"^\s*#{1,3}\s+")
ITALIC_RE = re.compile(r"^\*(.+)\*$")
BOLD_RE = re.compile(r"^\*\*(.+)\*\*$")

SECTION_ALIASES: dict[str, tuple[str, ...]] = {
    "summary": ("summary", "profile", "about", "objective", "overview"),
    "experience": (
        "experience",
        "work experience",
        "professional experience",
        "employment",
        "work history",
        "externship",
    ),
    "education": ("education", "academic", "academics"),
    "skills": ("skills", "technical skills", "technologies", "tech stack", "stack"),
    "projects": ("projects", "personal projects", "selected projects"),
    "certifications": ("certifications", "certificates", "licenses", "licenses & certifications"),
}

ROLE_AT_COMPANY = re.compile(
    r"^(?P<role>.+?)\s+(?:at|@|—|–|-)\s+(?P<company>.+)$",
    re.I,
)
DEGREE_AT_SCHOOL = re.compile(
    r"^(?P<degree>.+?)\s+(?:—|–|-)\s+(?P<school>.+)$",
)


@dataclass
class ParseResult:
    resume: Resume
    notes: list[str] = field(default_factory=list)


def _strip_markup(line: str) -> str:
    text = line.strip()
    text = HEADING_RE.sub("", text)
    italic = ITALIC_RE.match(text)
    if italic:
        text = italic.group(1)
    bold = BOLD_RE.match(text)
    if bold:
        text = bold.group(1)
    text = re.sub(r"^#+\s*", "", text)
    return text.strip().strip(":").strip()


def _is_bullet(line: str) -> bool:
    return bool(BULLET_RE.match(line))


def _bullet_text(line: str) -> str:
    return BULLET_RE.sub("", line).strip()


def _heading_key(line: str) -> str | None:
    cleaned = _strip_markup(line).lower()
    cleaned = cleaned.replace("&", "and")
    if not cleaned or len(cleaned) > 48:
        return None
    for key, aliases in SECTION_ALIASES.items():
        if cleaned in aliases:
            return key
    return None


def _looks_like_dates(line: str) -> bool:
    return bool(YEAR_RE.search(line)) and len(line) < 80


def _extract_years(line: str) -> tuple[str, str]:
    years = YEAR_RE.findall(line)
    if not years:
        return "", ""
    start = years[0]
    end = years[-1] if len(years) > 1 else start
    if re.search(r"\b(present|current|now)\b", line, re.I):
        end = "present"
    return start, end


def _split_role_company(line: str) -> tuple[str, str]:
    cleaned = _strip_markup(line)
    cleaned = re.sub(r"\s+\([^)]*\)\s*$", "", cleaned).strip()
    match = ROLE_AT_COMPANY.match(cleaned)
    if match:
        return match.group("role").strip(), match.group("company").strip()
    if " | " in cleaned:
        left, right = cleaned.split(" | ", 1)
        if len(left) <= len(right):
            return left.strip(), right.strip()
        return right.strip(), left.strip()
    return cleaned, ""


def _skills_from_line(line: str) -> tuple[str, list[str]]:
    cleaned = _strip_markup(line)
    if ":" in cleaned:
        label, rest = cleaned.split(":", 1)
        items = [part.strip() for part in re.split(r",|;", rest) if part.strip()]
        return label.strip() or "Skills", items
    items = [part.strip() for part in re.split(r",|;", cleaned) if part.strip()]
    return "Skills", items


def _stack_from_text(text: str) -> list[str]:
    fake = SourceJob(
        source="paste",
        source_id="paste",
        title="",
        company="",
        url="https://example.invalid",
        description=text,
    )
    return extract_job_skills(fake, SKILL_VOCABULARY)


def _parse_contact(lines: list[str]) -> tuple[ResumeBasics, int]:
    name = ""
    title = ""
    email = ""
    phone = ""
    location = ""
    links: list[dict[str, str]] = []
    used = 0
    for index, raw in enumerate(lines[:12]):
        if _heading_key(raw):
            break
        stripped = raw.strip()
        if not stripped:
            used = index + 1
            continue
        if _is_bullet(stripped):
            break
        for label, url in MD_LINK_RE.findall(stripped):
            links.append({"label": label, "url": url})
        for url in URL_RE.findall(stripped):
            if not any(item["url"] == url for item in links):
                host = url.split("/")[2] if "://" in url else url
                label = "GitHub" if "github" in host.lower() else "LinkedIn" if "linkedin" in host.lower() else host
                links.append({"label": label, "url": url})
        found_email = EMAIL_RE.search(stripped)
        if found_email:
            email = found_email.group(0)
        found_phone = PHONE_RE.search(stripped)
        if found_phone and len(re.sub(r"\D", "", found_phone.group(0))) >= 10:
            phone = found_phone.group(0)
        remainder = MD_LINK_RE.sub("", stripped)
        remainder = EMAIL_RE.sub("", remainder)
        remainder = URL_RE.sub("", remainder)
        remainder = PHONE_RE.sub("", remainder)
        remainder = re.sub(r"^[•*#\s]+", "", remainder)
        remainder = remainder.replace("·", " ").replace("|", " ")
        remainder = re.sub(r"\s+", " ", remainder).strip(" -,")
        if not name and remainder and not _heading_key(remainder) and len(remainder) < 80:
            name = _strip_markup(remainder)
        elif name and not title and remainder and len(remainder) < 120:
            if any(token in remainder.lower() for token in ("engineer", "student", "scientist", "developer", "grad")):
                title = _strip_markup(remainder)
            elif not location and not EMAIL_RE.search(stripped):
                location = remainder
        elif remainder and not location and "," in remainder and len(remainder) < 80:
            location = remainder
        used = index + 1
        if _heading_key(raw):
            break
    # Stop contact at first real section heading; `used` may include a heading line.
    for index, raw in enumerate(lines):
        if _heading_key(raw):
            used = index
            break
    return (
        ResumeBasics(name=name, title=title, email=email, phone=phone, location=location, links=links),
        used,
    )


def _section_map(lines: list[str]) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {key: [] for key in SECTION_ALIASES}
    sections["preamble"] = []
    current = "preamble"
    for line in lines:
        key = _heading_key(line)
        if key:
            current = key
            continue
        sections.setdefault(current, []).append(line)
    return sections


def _parse_experience(lines: list[str]) -> list[ResumeExperience]:
    roles: list[ResumeExperience] = []
    current: ResumeExperience | None = None
    pending_header = ""

    def flush() -> None:
        nonlocal current
        if current and (current.company or current.role or current.bullets):
            if current.bullets or current.company:
                text = " ".join([current.role, current.company, *current.bullets])
                if not current.stack:
                    current.stack = _stack_from_text(text)
                roles.append(current)
        current = None

    for raw in lines:
        stripped = raw.strip()
        if not stripped:
            continue
        cleaned = _strip_markup(stripped)
        if cleaned.lower().startswith("stack:"):
            if current:
                items = [part.strip() for part in cleaned.split(":", 1)[1].split(",") if part.strip()]
                current.stack = items
            continue
        if _is_bullet(stripped):
            if current is None:
                role, company = _split_role_company(pending_header) if pending_header else ("", "")
                current = ResumeExperience(
                    id=f"exp-{len(roles) + 1}",
                    company=company,
                    role=role or pending_header or "Experience",
                )
                pending_header = ""
            current.bullets.append(_bullet_text(stripped))
            continue
        if _looks_like_dates(stripped) and current is not None:
            start, end = _extract_years(stripped)
            if start:
                current.start = current.start or start
                current.end = end
            loc = YEAR_RE.sub("", stripped)
            loc = re.sub(r"\b(present|current|now)\b", "", loc, flags=re.I)
            loc = re.sub(r"[·|,;]+", " ", loc)
            loc = re.sub(r"\s+", " ", loc).strip(" -")
            if loc and not current.location:
                current.location = loc
            continue
        # New role header.
        flush()
        pending_header = ""
        role, company = _split_role_company(stripped)
        current = ResumeExperience(
            id=f"exp-{len(roles) + 1}",
            company=company,
            role=role,
        )
    flush()
    return roles


def _parse_education(lines: list[str]) -> list[ResumeEducation]:
    entries: list[ResumeEducation] = []
    pending_degree = ""
    pending_school = ""
    pending_detail: list[str] = []
    start = end = ""

    def flush() -> None:
        nonlocal pending_degree, pending_school, pending_detail, start, end
        if pending_school or pending_degree:
            entries.append(
                ResumeEducation(
                    id=f"edu-{len(entries) + 1}",
                    school=pending_school,
                    degree=pending_degree,
                    start=start,
                    end=end,
                    detail=" ".join(pending_detail).strip(),
                )
            )
        pending_degree = pending_school = ""
        pending_detail = []
        start = end = ""

    for raw in lines:
        stripped = raw.strip()
        if not stripped:
            continue
        if _is_bullet(stripped):
            pending_detail.append(_bullet_text(stripped))
            continue
        cleaned = _strip_markup(stripped)
        years = _extract_years(cleaned)
        if years[0]:
            start, end = years
        match = DEGREE_AT_SCHOOL.match(re.sub(r"\s*\([^)]*\)\s*$", "", cleaned))
        if match:
            flush()
            pending_degree = match.group("degree").strip()
            pending_school = match.group("school").strip()
            continue
        if not pending_school and not pending_degree:
            pending_school = cleaned
        else:
            if not pending_degree:
                pending_degree = cleaned
            else:
                pending_detail.append(cleaned)
    flush()
    return entries


def _parse_skills(lines: list[str]) -> list[ResumeSkillGroup]:
    groups: list[ResumeSkillGroup] = []
    for raw in lines:
        stripped = raw.strip()
        if not stripped:
            continue
        if _is_bullet(stripped):
            stripped = _bullet_text(stripped)
        label, items = _skills_from_line(stripped)
        if not items:
            continue
        groups.append(ResumeSkillGroup(id=f"sk-{len(groups) + 1}", label=label, items=items))
    return groups


def _parse_projects(lines: list[str]) -> list[ResumeProject]:
    projects: list[ResumeProject] = []
    current: ResumeProject | None = None
    for raw in lines:
        stripped = raw.strip()
        if not stripped:
            continue
        if _is_bullet(stripped):
            text = _bullet_text(stripped)
            if current is None:
                current = ResumeProject(id=f"proj-{len(projects) + 1}", name=text)
            else:
                current.description = (current.description + " " + text).strip()
            continue
        if current:
            projects.append(current)
        name = _strip_markup(stripped)
        url = ""
        md = MD_LINK_RE.search(stripped)
        if md:
            name, url = md.group(1), md.group(2)
        current = ResumeProject(id=f"proj-{len(projects) + 1}", name=name, url=url)
    if current:
        projects.append(current)
    return projects


def _parse_certs(lines: list[str]) -> list[str]:
    certs: list[str] = []
    for raw in lines:
        stripped = raw.strip()
        if not stripped:
            continue
        text = _bullet_text(stripped) if _is_bullet(stripped) else _strip_markup(stripped)
        for part in re.split(r",|;", text):
            if part.strip():
                certs.append(part.strip())
    return certs


def parse_resume(text: str) -> ParseResult:
    notes: list[str] = []
    raw = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    if not raw.strip():
        return ParseResult(
            resume=Resume(basics=ResumeBasics(name="", title="", email="")),
            notes=["Paste was empty; existing resume was left unchanged."],
        )
    lines = [line.rstrip() for line in raw.split("\n")]
    basics, contact_end = _parse_contact(lines)
    sections = _section_map(lines)
    summary_lines = [line.strip() for line in sections.get("summary", []) if line.strip() and not _is_bullet(line)]
    bullet_summary = [_bullet_text(line) for line in sections.get("summary", []) if _is_bullet(line)]
    basics.summary = " ".join(summary_lines + bullet_summary).strip()

    experience = _parse_experience(sections.get("experience", []))
    if not experience:
        leftover: list[str] = []
        for line in lines[contact_end:]:
            key = _heading_key(line)
            if key == "experience":
                continue
            if key and key != "experience":
                break
            leftover.append(line)
        experience = _parse_experience(leftover)
        if experience:
            notes.append(
                "No Experience heading found; grouped bullets under the nearest role line. "
                "Check company names before you run a search."
            )

    education = _parse_education(sections.get("education", []))
    skills = _parse_skills(sections.get("skills", []))
    projects = _parse_projects(sections.get("projects", []))
    certs = _parse_certs(sections.get("certifications", []))

    if not basics.summary:
        preamble = [line.strip() for line in sections.get("preamble", []) if line.strip() and not _is_bullet(line)]
        # Drop name/title already captured.
        extras = [line for line in preamble[2:] if line and line != basics.name and line != basics.title]
        if extras:
            basics.summary = " ".join(extras[:8]).strip()

    resume = Resume(
        basics=basics,
        skill_groups=skills,
        experience=experience,
        projects=projects,
        education=education,
        certifications=certs,
    )
    if experience:
        labeled = ", ".join(
            (role.company or role.role or "untitled") for role in experience
        )
        notes.append(
            f"Parsed {len(experience)} experience "
            f"{'entry' if len(experience) == 1 else 'entries'} ({labeled})."
        )
        missing_company = [role.role for role in experience if not role.company]
        if missing_company:
            notes.append(
                "Some roles have no company name in the paste, so none was stored. "
                "That is intentional — the parser will not invent an employer."
            )
    else:
        notes.append("No experience entries parsed. Tailoring will have no bullets to reorder.")
    if skills:
        notes.append(f"Parsed {sum(len(group.items) for group in skills)} skills.")
    if education:
        notes.append(f"Parsed {len(education)} education {'row' if len(education) == 1 else 'rows'}.")
    if certs:
        notes.append(f"Parsed {len(certs)} certification(s).")
    return ParseResult(resume=resume, notes=notes)


def merge_profile_from_resume(profile, resume: Resume, *, overwrite: bool = False):
    """Fill blank profile identity/skills from a parsed resume. Never invents titles."""
    updates: dict = {}
    basics = resume.basics
    if (overwrite or not profile.full_name.strip()) and basics.name:
        updates["full_name"] = basics.name
    if (overwrite or not profile.email.strip()) and basics.email:
        updates["email"] = basics.email
    if (overwrite or not profile.phone.strip()) and basics.phone:
        updates["phone"] = basics.phone
    if (overwrite or not profile.location.strip()) and basics.location:
        updates["location"] = basics.location
    if (overwrite or not profile.headline.strip()) and basics.title:
        updates["headline"] = basics.title
    if (overwrite or not profile.summary.strip()) and basics.summary:
        updates["summary"] = basics.summary
    if (overwrite or not profile.skills) and resume.skill_groups:
        updates["skills"] = [item for group in resume.skill_groups for item in group.items]
    for link in basics.links:
        url = (link.get("url") or "").strip()
        label = (link.get("label") or "").lower()
        if "linkedin" in label or "linkedin.com" in url.lower():
            if overwrite or not profile.linkedin_url:
                updates["linkedin_url"] = url
        if "github" in label or "github.com" in url.lower():
            if overwrite or not profile.github_url:
                updates["github_url"] = url
    return profile.model_copy(update=updates) if updates else profile
