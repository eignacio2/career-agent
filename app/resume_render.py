"""Turn a Resume into markdown. Tailoring never invents rows."""

from __future__ import annotations

from app.models import Resume


def format_date_range(start: str, end: str) -> str:
    def label(value: str) -> str:
        if not value:
            return ""
        if len(value) == 7 and value[4] == "-":
            year, month = value.split("-")
            months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
            try:
                return f"{months[int(month) - 1]} {year}"
            except (ValueError, IndexError):
                return value
        return value

    from_ = label(start)
    to = label(end)
    if from_ and to:
        return f"{from_} – {to}"
    return from_ or to


def order_skills(items: list[str], priority: list[str]) -> list[str]:
    if not priority:
        return items
    wanted = {item.lower() for item in priority}
    promoted = [item for item in items if item.lower() in wanted]
    rest = [item for item in items if item.lower() not in wanted]
    return promoted + rest


def render_resume_markdown(
    resume: Resume,
    *,
    summary: str | None = None,
    bullets_by_experience_id: dict[str, list[str]] | None = None,
    priority_skills: list[str] | None = None,
    target_title: str | None = None,
) -> str:
    basics = resume.basics
    lines: list[str] = [f"# {basics.name}"]
    title = target_title or basics.title
    if title:
        lines.append(f"**{title}**")

    contact = " · ".join(part for part in (basics.location, basics.email, basics.phone) if part)
    links = " · ".join(
        f"[{link.get('label', 'link')}]({link['url']})" for link in basics.links if link.get("url")
    )
    if contact:
        lines.extend(["", contact])
    if links:
        lines.append(links)

    summary_text = summary or basics.summary
    if summary_text:
        lines.extend(["", "## Summary", "", summary_text])

    if resume.skill_groups:
        lines.extend(["", "## Skills", ""])
        for group in resume.skill_groups:
            items = order_skills(group.items, priority_skills or [])
            if items:
                lines.extend([f"**{group.label}:** {', '.join(items)}", ""])

    if resume.experience:
        lines.extend(["", "## Experience", ""])
        for role in resume.experience:
            lines.append(f"### {role.role} — {role.company}")
            meta = " · ".join(part for part in (role.location, format_date_range(role.start, role.end)) if part)
            if meta:
                lines.append(f"*{meta}*")
            lines.append("")
            bullets = (bullets_by_experience_id or {}).get(role.id, role.bullets)
            for bullet in bullets:
                lines.append(f"- {bullet}")
            if role.stack:
                lines.extend(["", f"*Stack: {', '.join(order_skills(role.stack, priority_skills or []))}*"])
            lines.append("")

    if resume.projects:
        lines.extend(["## Projects", ""])
        for project in resume.projects:
            heading = f"[{project.name}]({project.url})" if project.url else project.name
            lines.extend([f"### {heading}", "", project.description])
            if project.stack:
                lines.extend(["", f"*Stack: {', '.join(project.stack)}*"])
            lines.append("")

    if resume.education:
        lines.extend(["## Education", ""])
        for entry in resume.education:
            span = format_date_range(entry.start, entry.end)
            suffix = f" ({span})" if span else ""
            lines.append(f"**{entry.degree}** — {entry.school}{suffix}")
            if entry.detail:
                lines.extend(["", entry.detail])
            lines.append("")

    if resume.certifications:
        lines.extend(["## Certifications", ""])
        for cert in resume.certifications:
            lines.append(f"- {cert}")
        lines.append("")

    text = "\n".join(lines)
    while "\n\n\n" in text:
        text = text.replace("\n\n\n", "\n\n")
    return text.strip()


def escape_html(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
