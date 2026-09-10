"""Daily digest: markdown on disk, email if SMTP is set.

The markdown file is the interview artifact — you can `cat` it. Email is the
same text going through `send_mail()`.
"""

from __future__ import annotations

from pathlib import Path

from app import config
from app.models import Application, Job, Profile, RunStats, now_iso


def _score_label(job: Job) -> str:
    return "unscored" if job.score is None else f"{job.score}/100"


def build_digest_text(
    *,
    profile: Profile,
    stats: RunStats,
    submitted: list[tuple[Application, Job]],
    awaiting: list[tuple[Application, Job]],
    skipped: list[tuple[Job, str]],
    notes: list[str],
) -> tuple[str, str]:
    """Returns (subject, markdown)."""
    if stats.submitted:
        subject = f"{stats.submitted} application(s) sent · {stats.awaiting_review} awaiting review"
    elif stats.awaiting_review:
        subject = f"{stats.awaiting_review} application(s) ready for your review"
    else:
        subject = f"No new matches today · {stats.discovered} postings screened"

    lines = [
        f"# Job search digest — {now_iso()[:10]}",
        "",
        subject,
        "",
        (
            f"Screened **{stats.discovered}** new · scored **{stats.scored}** · "
            f"sent **{stats.submitted}** · awaiting review **{stats.awaiting_review}** · "
            f"skipped **{stats.skipped}** · top score **{stats.top_score}**"
        ),
        "",
    ]

    if submitted:
        lines += ["## Applications sent", ""]
        for application, job in submitted:
            lines += [
                f"- **{job.title}** — {job.company} ({_score_label(job)})",
                f"  {job.location} · emailed {job.apply_email}",
                f"  {job.url}",
                "",
            ]

    if awaiting:
        lines += ["## Ready for your review", ""]
        for application, job in awaiting:
            why = (
                "submit through the company's own form"
                if application.channel == "external_form"
                else "email application drafted, waiting on you (autopilot off or SMTP missing)"
            )
            lines += [
                f"- **{job.title}** — {job.company} ({_score_label(job)}) — {why}",
                f"  {job.location}",
                f"  Pack: `.data/applications/{application.id}/`",
                f"  Posting: {job.url}",
                "",
            ]

    if skipped:
        lines += ["## Skipped (first 12)", ""]
        for job, reason in skipped[:12]:
            lines.append(f"- {job.title} — {job.company} ({_score_label(job)}): {reason}")
        lines.append("")

    if notes:
        lines += ["## Run notes", ""]
        for note in notes:
            lines.append(f"- {note}")
        lines.append("")

    lines.append(f"For {profile.full_name} · digest to {profile.digest_email or profile.email}")
    return subject, "\n".join(lines).strip() + "\n"


def write_digest_file(text: str) -> Path:
    folder = Path(config.DATA_DIR) / "digests"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{now_iso()[:10]}.md"
    # A second run the same day appends a separator rather than overwriting.
    if path.exists():
        path.write_text(path.read_text(encoding="utf-8") + "\n---\n\n" + text, encoding="utf-8")
    else:
        path.write_text(text, encoding="utf-8")
    return path
