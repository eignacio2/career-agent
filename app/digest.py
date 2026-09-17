"""Run report: markdown on disk, email if SMTP is set.

The same text is the interview artifact (`python -m app digest`) and the
message sent to the address on the profile. Poor matches (skipped) are
counted in the summary line but not listed.
"""

from __future__ import annotations

from pathlib import Path

from app import config
from app.models import Application, Job, Profile, RunStats, now_iso


def _score_label(job: Job) -> str:
    return "unscored" if job.score is None else f"{job.score}/100"


def _job_lines(job: Job, extra: str = "") -> list[str]:
    lines = [
        f"- **{job.title}** — {job.company} ({_score_label(job)})",
        f"  {job.location}{extra}",
        f"  {job.url}",
        "",
    ]
    if job.score_reasons:
        lines.insert(-1, f"  {job.score_reasons[0]}")
    return lines


def build_digest_text(
    *,
    profile: Profile,
    stats: RunStats,
    submitted: list[tuple[Application, Job]],
    awaiting: list[tuple[Application, Job]],
    shortlisted: list[Job],
    notes: list[str],
) -> tuple[str, str]:
    """Returns (subject, markdown). Skipped jobs are omitted on purpose."""
    ready = len(awaiting)
    close = len(shortlisted)
    if stats.submitted:
        subject = f"{stats.submitted} application(s) sent · {ready} ready for you"
    elif ready:
        subject = f"{ready} role(s) ready for you to apply"
    elif close:
        subject = f"{close} close match(es) · none cleared the apply threshold"
    else:
        subject = f"No strong matches this run · {stats.discovered} postings screened"

    to = (profile.digest_email or profile.email).strip()
    lines = [
        f"# Job search digest — {now_iso()[:10]}",
        "",
        subject,
        "",
        (
            f"Screened **{stats.discovered}** new · scored **{stats.scored}** · "
            f"ready **{ready}** · close **{close}** · "
            f"sent **{stats.submitted}** · skipped **{stats.skipped}** "
            f"(not listed) · top score **{stats.top_score}**"
        ),
        "",
    ]

    if submitted:
        lines += ["## Applications sent", ""]
        for application, job in submitted:
            extra = f" · emailed {job.apply_email}" if job.apply_email else ""
            lines += _job_lines(job, extra)

    if awaiting:
        lines += ["## Ready for you to apply", ""]
        for application, job in awaiting:
            why = (
                "submit through the company's own form"
                if application.channel == "external_form"
                else "email pack drafted; autopilot is off, so nothing was sent to the employer"
            )
            lines += [
                f"- **{job.title}** — {job.company} ({_score_label(job)}) — {why}",
                f"  {job.location}",
                f"  Pack: `.data/applications/{application.id}/`",
                f"  Posting: {job.url}",
                "",
            ]

    if shortlisted:
        lines += ["## Close matches (below the apply threshold)", ""]
        for job in shortlisted:
            lines += _job_lines(job)

    if notes:
        lines += ["## Run notes", ""]
        for note in notes:
            lines.append(f"- {note}")
        lines.append("")

    lines.append(f"For {profile.full_name} · digest to {to or '(no address set)'}")
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
