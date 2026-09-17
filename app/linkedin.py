"""LinkedIn copy-paste pack.

LinkedIn has no official write API for this. The agent produces headline,
About, skills, and a field-by-field change list. You paste. Diffs are against
the snapshot stored for this candidate — never fetched from a profile URL.
"""

from __future__ import annotations

import re

from app.models import Job, LinkedInChange, LinkedInPack, LinkedInSnapshot, Profile, Resume
from app.scoring.score import extract_job_skills

# Known public state of the demo profile. Loaded by `python -m app load-demo`.
# Do not use this as a fallback for other candidates.
DEMO_SNAPSHOT = LinkedInSnapshot(
    headline="Computer Science Student | Seeking Software Engineering Internship | Microsoft Office",
    about=(
        "I am a student building my confidence. Growing up my family supported "
        "my interest in computers. Skilled in Microsoft Office and JavaFX."
    ),
    skills=["Battleship Game", "JavaFX", "UI", "Microsoft Office"],
    open_to_work="On-site, Hybrid",
    has_experience_section=False,
    has_certifications_section=False,
)

# Kept so existing tests and interview notes can still import the old name.
CURRENT_SNAPSHOT = DEMO_SNAPSHOT

SNAPSHOT_LABEL = re.compile(
    r"^(headline|about|skills|open to work|open-to-work|experience section|"
    r"certifications? section)\s*:\s*(.*)$",
    re.I,
)
YES = {"yes", "y", "true", "1", "on"}


def blank_snapshot() -> LinkedInSnapshot:
    return LinkedInSnapshot()


def parse_linkedin_snapshot(text: str) -> LinkedInSnapshot:
    """Read a labeled paste. Unknown text is treated as About, not as Ethan's profile."""
    raw = (text or "").replace("\r\n", "\n")
    if not raw.strip():
        return blank_snapshot()
    current = "about"
    chunks: dict[str, list[str]] = {"headline": [], "about": [], "skills": [], "open_to_work": [], "experience": [], "certs": []}
    alias = {
        "headline": "headline",
        "about": "about",
        "skills": "skills",
        "open to work": "open_to_work",
        "open-to-work": "open_to_work",
        "experience section": "experience",
        "certification section": "certs",
        "certifications section": "certs",
    }
    for line in raw.split("\n"):
        match = SNAPSHOT_LABEL.match(line.strip())
        if match:
            current = alias.get(match.group(1).lower(), "about")
            rest = match.group(2).strip()
            if rest:
                chunks.setdefault(current, []).append(rest)
            continue
        chunks.setdefault(current, []).append(line)
    headline = " ".join(part.strip() for part in chunks.get("headline", []) if part.strip())
    about = "\n".join(chunks.get("about", [])).strip()
    skills_raw = " ".join(chunks.get("skills", []))
    skills = [part.strip() for part in re.split(r"[,;\n]", skills_raw) if part.strip()]
    open_to = " ".join(part.strip() for part in chunks.get("open_to_work", []) if part.strip())
    exp_raw = " ".join(chunks.get("experience", [])).strip().lower()
    cert_raw = " ".join(chunks.get("certs", [])).strip().lower()
    has_experience = any(token in exp_raw for token in YES) or exp_raw in {"present", "added"}
    has_certs = any(token in cert_raw for token in YES) or cert_raw in {"present", "added"}
    if not headline and not about and not skills and not open_to:
        # Unlabeled paste: first short line is headline, the rest is About.
        nonempty = [line.strip() for line in raw.split("\n") if line.strip()]
        if nonempty and len(nonempty[0]) <= 220 and ":" not in nonempty[0][:12]:
            headline = nonempty[0]
            about = "\n".join(nonempty[1:]).strip()
    return LinkedInSnapshot(
        headline=headline,
        about=about,
        skills=skills,
        open_to_work=open_to,
        has_experience_section=has_experience,
        has_certifications_section=has_certs,
    )

WEAK_HEADLINE = [
    ("microsoft office", "Listing office software on a technical profile wastes recruiter-search keywords."),
    ("seeking", "\"Seeking\" frames you as asking rather than offering."),
    ("internship", "Asking for an internship tells full-time recruiters to skip you."),
    ("student", "\"Student\" undersells a new-grad search and filters you out of full-time roles."),
    ("confidence", "Naming a lack of confidence in the headline invites doubt."),
    ("aspiring", "\"Aspiring\" signals you do not yet do the work."),
    ("passionate", "Every profile says passionate, so it carries no information."),
]

ACRONYMS = {"sql", "ai", "ml", "llm", "aws", "nlp", "rag", "api"}


def _market_demand(jobs: list[Job]) -> list[tuple[str, int]]:
    counts: dict[str, int] = {}
    for job in jobs:
        for skill in extract_job_skills(job):
            counts[skill] = counts.get(skill, 0) + 1
    return sorted(counts.items(), key=lambda item: item[1], reverse=True)


def _casing(profile: Profile, resume: Resume) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for skill in [*profile.skills, *[item for group in resume.skill_groups for item in group.items]]:
        mapping.setdefault(skill.lower(), skill)
    return mapping


def _display(skill: str, casing: dict[str, str]) -> str:
    key = skill.lower().strip()
    if key in casing:
        return casing[key]
    if key in ACRONYMS:
        return key.upper()
    return skill[:1].upper() + skill[1:]


def _diff(snapshot: LinkedInSnapshot, pack: LinkedInPack, profile: Profile, resume: Resume) -> list[LinkedInChange]:
    changes: list[LinkedInChange] = []
    headline = snapshot.headline.strip()
    lowered = headline.lower()
    problems = [why for phrase, why in WEAK_HEADLINE if phrase in lowered]
    mentions_target = False
    needles: list[str] = []
    for target in profile.target_titles:
        lowered_target = target.lower().strip()
        if lowered_target:
            needles.append(lowered_target)
            needles.extend(
                word
                for word in re.split(r"[^a-z0-9]+", lowered_target)
                if len(word) > 2 and word not in {"the", "and", "for", "with"}
            )
    if needles:
        mentions_target = any(needle in lowered for needle in needles)
    if not headline:
        changes.append(
            LinkedInChange(
                field="Headline",
                current="(no snapshot pasted)",
                proposed=pack.headline,
                why="Paste your current LinkedIn headline so this pack can diff against it. Until then, here is what to put there.",
                severity="recommended",
            )
        )
    elif problems or (needles and not mentions_target):
        if needles and not mentions_target:
            problems.append(
                "The headline never names one of your target titles, so you miss recruiter searches for those roles."
            )
        changes.append(
            LinkedInChange(
                field="Headline",
                current=headline,
                proposed=pack.headline,
                why=" ".join(problems),
                severity="critical",
            )
        )

    if not snapshot.has_experience_section and resume.experience:
        role = resume.experience[0]
        changes.append(
            LinkedInChange(
                field="Experience section",
                current="No experience entries on your profile",
                proposed=f"Add {role.role} at {role.company} ({role.start} to {role.end})",
                why=(
                    f"Recruiter search filters on titles held. An empty Experience section hides "
                    f"{role.role} at {role.company}."
                    if role.company
                    else f"Recruiter search filters on titles held. An empty Experience section hides {role.role}."
                ),
                severity="critical",
            )
        )

    about = snapshot.about.strip()
    if about:
        about_problems = []
        if not any(ch.isdigit() for ch in about):
            about_problems.append("About has no numbers, so nothing in it is verifiable.")
        if any(word in about.lower() for word in ("my mom", "family", "growing up")):
            about_problems.append("The origin story occupies the lines LinkedIn shows before See more.")
        if "microsoft office" in about.lower():
            about_problems.append("Microsoft Office should be cut from About.")
        if resume.experience and resume.experience[0].company and resume.experience[0].company.lower() not in about.lower():
            about_problems.append(f"It does not mention {resume.experience[0].company}, your strongest credential.")
        if about_problems:
            changes.append(
                LinkedInChange(
                    field="About",
                    current=about[:220] + ("…" if len(about) > 220 else ""),
                    proposed=pack.about,
                    why=" ".join(about_problems),
                    severity="critical",
                )
            )

    if snapshot.skills:
        top = snapshot.skills[:3]
        weak = [skill for skill in top if not any(skill.lower() == owned.lower() for owned in profile.skills)]
        if weak:
            changes.append(
                LinkedInChange(
                    field="Top three skills",
                    current=", ".join(top),
                    proposed=", ".join(pack.skills[:3]),
                    why=(
                        f"LinkedIn weights the first three skills in recruiter search, and yours "
                        f"lead with {', '.join(weak)}. Pin Python / SQL / Java (or the market-ranked set) instead."
                    ),
                    severity="critical",
                )
            )

    open_to = snapshot.open_to_work.lower()
    if open_to and "remote" not in open_to and profile.remote_preference != "onsite":
        changes.append(
            LinkedInChange(
                field="Open to work",
                current=snapshot.open_to_work,
                proposed=pack.open_to_work,
                why="The banner excludes Remote, which is most of the entry-level AI/DS market.",
                severity="recommended",
            )
        )

    if not snapshot.has_certifications_section and resume.certifications:
        changes.append(
            LinkedInChange(
                field="Licenses & certifications",
                current="No certifications section",
                proposed="; ".join(resume.certifications),
                why=(
                    f"{'; '.join(resume.certifications)} "
                    f"{'is' if len(resume.certifications) == 1 else 'are'} on the resume "
                    "and missing from LinkedIn. It is a searchable field."
                ),
                severity="recommended",
            )
        )
    return changes


def generate_linkedin_pack(
    profile: Profile,
    resume: Resume,
    jobs: list[Job],
    snapshot: LinkedInSnapshot | None = None,
) -> LinkedInPack:
    snapshot = snapshot if snapshot is not None else LinkedInSnapshot()
    owned = {skill.lower() for skill in [*profile.skills, *[i for g in resume.skill_groups for i in g.items]]}
    demand = _market_demand(jobs)
    validated = [(skill, count) for skill, count in demand if skill.lower() in owned]
    gaps = [(skill, count) for skill, count in demand if skill.lower() not in owned][:6]
    casing = _casing(profile, resume)

    titles = " / ".join(profile.target_titles[:2]) or (profile.headline.split("·")[0].strip() if profile.headline else "Target role")
    headline_skills = [_display(skill, casing) for skill, _ in validated[:4]]
    city = ""
    if profile.target_locations:
        city = profile.target_locations[0]
    elif profile.location:
        city = profile.location.split("·")[0].strip()
    if profile.location_mode == "chicago-office":
        arrangement = "Hybrid or on-site in Chicago"
        open_to_place = "Hybrid or on-site in Chicago, IL"
        about_place = "in Chicago (hybrid or on-site)"
    else:
        arrangement = "Remote, hybrid, or on-site"
        open_to_place = "Remote, hybrid, or on-site"
        plus = f" ({city} is a plus)" if city else ""
        about_place = f"remote, hybrid, or on-site{plus}"
    skill_bit = (
        " · ".join(headline_skills)
        or " · ".join(_display(skill, casing) for skill in profile.skills[:3])
        or "see skills"
    )
    headline = f"{titles} · {skill_bit} · {arrangement}"[:220]

    quantified = [
        bullet
        for role in resume.experience
        for bullet in role.bullets
        if any(ch.isdigit() for ch in bullet)
    ][:4]
    quantified_lines = [f"• {bullet}" for bullet in quantified]
    if not quantified_lines and resume.experience and resume.experience[0].bullets:
        quantified_lines = [f"• {resume.experience[0].bullets[0]}"]
    about_lines = [
        profile.summary or resume.basics.summary,
        "",
        "What that has looked like in practice:",
        *quantified_lines,
        "",
        (
            f"Currently open to {', '.join(profile.target_titles[:3]) or 'matching'} roles "
            f"{about_place}. Fastest contact: {profile.email}."
        ),
    ]
    about = "\n".join(about_lines)

    skills = [
        *[_display(skill, casing) for skill, _ in validated],
        *[skill for skill in profile.skills if not any(skill.lower() == v[0].lower() for v in validated)],
    ][:30]

    rewrites = [
        {
            "company": role.company,
            "role": role.role,
            "bullets": sorted(role.bullets, key=lambda b: (0 if any(ch.isdigit() for ch in b) else 1))[:3],
        }
        for role in resume.experience[:3]
    ]

    rationale = [
        (
            f"Ordered headline and skills by frequency across {len(jobs)} tracked postings, led by "
            f"{', '.join(s for s, _ in validated[:5])}."
            if validated
            else "No live postings to rank against, so this pack uses your stated skill order."
        ),
        "Moved the strongest work into About; that is what LinkedIn shows before See more.",
        "Trimmed each role to three bullets because LinkedIn truncates long entries.",
        (
            f"Recurring requirements you do not list: {', '.join(s for s, _ in gaps)}. "
            "Add them only if you can defend them in an interview."
            if gaps
            else "No high-frequency requirements are missing from your listed skills."
        ),
    ]

    grad = ""
    if resume.education and resume.education[0].end:
        grad = f" · Starting after {resume.education[0].end} graduation"
    pack = LinkedInPack(
        headline=headline,
        about=about,
        skills=skills,
        experience_rewrites=rewrites,
        open_to_work=f"Open to {', '.join(profile.target_titles[:4]) or 'roles'} · {open_to_place}{grad}",
        rationale=rationale,
        generated_by="heuristic",
    )
    pack.changes = _diff(snapshot, pack, profile, resume)
    return pack


def render_linkedin_markdown(pack: LinkedInPack) -> str:
    lines = [
        "# LinkedIn copy-paste pack",
        "",
        "LinkedIn is not written by this agent. Paste these fields yourself.",
        "",
        "## Headline",
        "",
        pack.headline,
        "",
        "## About",
        "",
        pack.about,
        "",
        "## Skills (pin the first three)",
        "",
        ", ".join(pack.skills),
        "",
        "## Open to work",
        "",
        pack.open_to_work,
        "",
        "## Experience rewrites",
        "",
    ]
    for role in pack.experience_rewrites:
        lines.append(f"### {role.get('role')} — {role.get('company')}")
        for bullet in role.get("bullets") or []:
            lines.append(f"- {bullet}")
        lines.append("")
    if pack.changes:
        lines += ["## What to change vs the current profile", ""]
        for change in pack.changes:
            lines += [
                f"### {change.field} ({change.severity})",
                "",
                f"**Now:** {change.current}",
                "",
                f"**Paste:** {change.proposed}",
                "",
                f"**Why:** {change.why}",
                "",
            ]
    lines += ["## Why these edits", ""]
    for item in pack.rationale:
        lines.append(f"- {item}")
    return "\n".join(lines).strip() + "\n"
