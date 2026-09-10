"""LinkedIn copy-paste pack.

LinkedIn has no official write API for this. The agent produces headline,
About, skills, and a field-by-field change list. You paste. The snapshot
below is the last known public state of Ethan's profile so the diffs are
specific rather than generic advice.
"""

from __future__ import annotations

from app.models import Job, LinkedInChange, LinkedInPack, LinkedInSnapshot, Profile, Resume
from app.scoring.score import extract_job_skills

# Public issues already identified on the live profile. Update this if you
# paste a newer snapshot; do not invent a cleaner current profile.
CURRENT_SNAPSHOT = LinkedInSnapshot(
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
    mentions_target = any(
        word in lowered
        for word in ("ai", "ml", "machine learning", "llm", "forward deployed", "fde")
    )
    if headline and (problems or not mentions_target):
        if not mentions_target:
            problems.append(
                "The headline never says AI, ML, or forward deployed, so you miss recruiter searches for those roles."
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
                why="Recruiter search filters on titles held. An empty Experience section hides the Wayfair externship.",
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
        if resume.experience and resume.experience[0].company.lower() not in about.lower():
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
                why="AWS CCP is on the resume and missing from LinkedIn. It is a searchable field.",
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
    snapshot = snapshot or CURRENT_SNAPSHOT
    owned = {skill.lower() for skill in [*profile.skills, *[i for g in resume.skill_groups for i in g.items]]}
    demand = _market_demand(jobs)
    validated = [(skill, count) for skill, count in demand if skill.lower() in owned]
    gaps = [(skill, count) for skill, count in demand if skill.lower() not in owned][:6]
    casing = _casing(profile, resume)

    titles = " / ".join(profile.target_titles[:2]) or "AI Engineer"
    headline_skills = [_display(skill, casing) for skill, _ in validated[:4]]
    arrangement = "Hybrid or on-site in Chicago"
    skill_bit = " · ".join(headline_skills) if headline_skills else "Python · SQL · agents"
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
        profile.summary,
        "",
        "What that has looked like in practice:",
        *quantified_lines,
        "",
        (
            f"Currently open to {', '.join(profile.target_titles[:3])} roles "
            f"in Chicago (hybrid or on-site). Fastest contact: {profile.email}."
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

    pack = LinkedInPack(
        headline=headline,
        about=about,
        skills=skills,
        experience_rewrites=rewrites,
        open_to_work=(
            f"Open to {', '.join(profile.target_titles[:4])} · Hybrid or on-site in "
            f"Chicago, IL · Starting after May 2026 graduation"
        ),
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
