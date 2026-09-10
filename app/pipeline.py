"""One agent run: discover → filter → store → score → tailor → apply/queue → digest.

The CLI and the web form both call `run_agent()`. Interview walkthrough
starts here, then jumps into filter.py and score.py.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from pathlib import Path

from app import config, db
from app.apply import channel_for, submit_by_email
from app.digest import build_digest_text, write_digest_file
from app.linkedin import generate_linkedin_pack, render_linkedin_markdown
from app.mail import MailMessage, is_smtp_configured, send_mail
from app.geo import location_allowed
from app.models import Job, RunLogEntry, RunStats, TailoredApplication, now_iso
from app.scoring.score import score_job
from app.sources.discover import discover
from app.sources.filter import classify_role, is_plausible_target
from app.tailor import tailor_application

DEFAULT_QUERIES = [
    "ai engineer",
    "forward deployed engineer",
    "machine learning engineer",
    "customer engineer",
]

_run_lock = threading.Lock()
SHORTLIST_MARGIN = 12


class RunInProgress(RuntimeError):
    pass


class RunLog:
    def __init__(self) -> None:
        self.entries: list[RunLogEntry] = []

    def add(self, step: str, message: str, level: str = "info") -> None:
        self.entries.append(
            RunLogEntry(at=now_iso(), step=step, message=message, level=level)  # type: ignore[arg-type]
        )


def _start_of_utc_day() -> str:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")


def _write_pack(application_id: int, tailored: TailoredApplication, job: Job) -> Path:
    folder = Path(config.DATA_DIR) / "applications" / str(application_id)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "resume.md").write_text(tailored.resume_markdown, encoding="utf-8")
    (folder / "cover-letter.md").write_text(tailored.cover_letter, encoding="utf-8")
    (folder / "notes.md").write_text(
        "\n".join(f"- {note}" for note in tailored.notes) + f"\n\nPosting: {job.url}\n",
        encoding="utf-8",
    )
    return folder


def run_agent(
    *,
    trigger: str,
    limit_per_source: int = 25,
    offline: bool | None = None,
    send_digest: bool = True,
    refresh_linkedin: bool = True,
) -> dict:
    if not _run_lock.acquire(blocking=False):
        raise RunInProgress("An agent run is already in progress.")
    try:
        if db.is_run_in_progress():
            raise RunInProgress("An agent run is already in progress.")
        return _run(
            trigger=trigger,
            limit_per_source=limit_per_source,
            offline=offline,
            send_digest=send_digest,
            refresh_linkedin=refresh_linkedin,
        )
    finally:
        _run_lock.release()


def _run(
    *,
    trigger: str,
    limit_per_source: int,
    offline: bool | None,
    send_digest: bool,
    refresh_linkedin: bool,
) -> dict:
    run = db.create_run(trigger)
    log = RunLog()
    stats = RunStats()
    notes: list[str] = []
    skipped: list[tuple[Job, str]] = []
    submitted: list = []
    awaiting: list = []

    try:
        profile = db.get_profile()
        resume = db.get_resume()
        log.add(
            "start",
            (
                f"Run triggered by {trigger}. Heuristic scoring and tailoring "
                f"(no LLM). Level: {profile.experience_level}, years ceiling: "
                f"{profile.max_years_required}, autopilot: {profile.autopilot_enabled}."
            ),
        )

        queries = profile.target_titles or DEFAULT_QUERIES
        discovery = discover(queries, limit_per_source, offline=offline)

        if discovery.used_fallback:
            log.add(
                "discover",
                (
                    "Live boards were unreachable "
                    f"({', '.join(discovery.sources_failed) or 'offline mode'}), "
                    "so the bundled sample board was used."
                ),
                "warn",
            )
            notes.append("Live job boards were unreachable or --offline was set; sample board used.")
        else:
            log.add(
                "discover",
                (
                    f"Queried {', '.join(discovery.sources_used)} for {len(queries)} "
                    f"target titles and got {len(discovery.jobs)} postings back."
                ),
            )
            if discovery.sources_failed:
                log.add("discover", f"No results from {', '.join(discovery.sources_failed)}.", "warn")

        title_ok = [
            job
            for job in discovery.jobs
            if is_plausible_target(job, include_internships=profile.include_internships)
        ]
        plausible: list = []
        dropped_location = 0
        for job in title_ok:
            allowed, reason = location_allowed(job, profile)
            if allowed:
                plausible.append(job)
            else:
                dropped_location += 1
        log.add(
            "filter",
            (
                f"{len(title_ok)} of {len(discovery.jobs)} postings passed the title pre-filter "
                f"(AI Engineer / Forward Deployed). "
                f"{len(plausible)} also passed the location filter "
                f"({profile.location_mode}); dropped {dropped_location} on location."
            ),
        )

        fresh: list[Job] = []
        for candidate in plausible:
            inserted = db.insert_job_if_new(
                source=candidate.source,
                source_id=candidate.source_id,
                title=candidate.title,
                company=candidate.company,
                location=candidate.location,
                remote=candidate.remote,
                url=candidate.url,
                apply_email=candidate.apply_email,
                description=candidate.description,
                salary_text=candidate.salary_text,
                tags=candidate.tags,
                role_family=classify_role(candidate),
                early_career=candidate.early_career,
                posted_at=candidate.posted_at,
                run_id=run.id,
            )
            if inserted:
                fresh.append(inserted)

        pending = db.list_jobs(status=["new"], limit=60, unscored_only=True)
        seen_ids = {job.id for job in fresh}
        to_score = fresh + [job for job in pending if job.id not in seen_ids]
        stats.discovered = len(fresh)
        log.add(
            "dedupe",
            (
                f"{len(fresh)} postings were new; {len(plausible) - len(fresh)} already seen. "
                f"{len(to_score)} queued for scoring."
            ),
        )

        scored: list[Job] = []
        threshold = profile.auto_apply_threshold
        for job in to_score:
            match = score_job(job, profile, resume)
            if match.verdict == "Excluded":
                status = "skipped"
            elif match.score >= threshold:
                status = "queued"
            elif match.score >= max(0, threshold - SHORTLIST_MARGIN):
                status = "shortlisted"
            else:
                status = "skipped"
            db.record_score(job.id, match.score, match.verdict, match.reasons, match.gaps, status)
            updated = job.model_copy(
                update={
                    "score": match.score,
                    "score_verdict": match.verdict,
                    "score_reasons": match.reasons,
                    "score_gaps": match.gaps,
                    "status": status,
                }
            )
            scored.append(updated)
            if status == "skipped":
                reason = match.gaps[0] if match.gaps else f"scored {match.score}, below {threshold}"
                skipped.append((updated, reason))
                stats.skipped += 1

        stats.scored = len(scored)
        stats.top_score = max((job.score or 0 for job in scored), default=0)
        scored.sort(key=lambda job: job.score or 0, reverse=True)
        if scored:
            top = scored[0]
            log.add(
                "score",
                f"Scored {len(scored)}. Top: {top.title} at {top.company} ({top.score}).",
            )
        else:
            log.add("score", "Nothing new to score.")

        remaining_cap = max(0, profile.daily_application_cap - db.count_submitted_since(_start_of_utc_day()))
        to_prepare = [
            job
            for job in db.list_jobs(status=["queued"], limit=80)
            if db.get_application_for_job(job.id) is None
        ]

        for job in to_prepare:
            if remaining_cap < 0:
                break
            tailored = tailor_application(job, profile, resume)
            channel = channel_for(job)
            can_send = (
                profile.autopilot_enabled
                and channel == "email"
                and remaining_cap > 0
            )
            if can_send:
                sent, _result, message = submit_by_email(job, profile, tailored)
            else:
                sent, message = False, _review_reason(profile.autopilot_enabled, channel, remaining_cap)

            if sent:
                application = db.upsert_application(
                    job_id=job.id,
                    status="submitted",
                    channel=channel,
                    resume_markdown=tailored.resume_markdown,
                    cover_letter=tailored.cover_letter,
                    tailoring_notes=tailored.notes,
                    run_id=run.id,
                    notes=message,
                    submitted_at=now_iso(),
                    job_status="applied",
                )
                _write_pack(application.id, tailored, job)
                submitted.append((application, job))
                stats.submitted += 1
                remaining_cap -= 1
                log.add("apply", f"Applied to {job.title} at {job.company}. {message}")
            else:
                status = "needs_manual_submit" if channel == "external_form" else "awaiting_review"
                application = db.upsert_application(
                    job_id=job.id,
                    status=status,
                    channel=channel,
                    resume_markdown=tailored.resume_markdown,
                    cover_letter=tailored.cover_letter,
                    tailoring_notes=tailored.notes,
                    run_id=run.id,
                    notes=message,
                    job_status="queued",
                )
                _write_pack(application.id, tailored, job)
                awaiting.append((application, job))
                stats.awaiting_review += 1
                stats.queued += 1
                log.add("apply", f"Prepared {job.title} at {job.company}. {message}")

        if not profile.autopilot_enabled and stats.awaiting_review:
            notes.append(
                f"Autopilot is off, so {stats.awaiting_review} pack(s) wait for you instead of being emailed."
            )
        if not is_smtp_configured():
            notes.append("SMTP is not set; mail lands in .data/outbox instead of a real inbox.")
        form_count = sum(1 for app, _job in awaiting if app.channel == "external_form")
        if form_count:
            notes.append(
                f"{form_count} posting(s) use an ATS form. Packs are ready; this agent does not fill third-party forms."
            )

        if refresh_linkedin:
            market = db.list_jobs(limit=60)
            pack = generate_linkedin_pack(profile, resume, market)
            db.save_linkedin_pack(pack)
            pack_path = Path(config.DATA_DIR) / "linkedin-pack.md"
            pack_path.write_text(render_linkedin_markdown(pack), encoding="utf-8")
            log.add("profile", f"Wrote LinkedIn pack ({len(pack.changes)} edits) to {pack_path}.")

        digest_path = None
        if send_digest:
            subject, text = build_digest_text(
                profile=profile,
                stats=stats,
                submitted=submitted,
                awaiting=awaiting,
                skipped=skipped,
                notes=notes,
            )
            digest_path = write_digest_file(text)
            delivery = send_mail(
                MailMessage(
                    to=profile.digest_email or profile.email,
                    subject=subject,
                    text=text,
                    html=f"<pre>{text}</pre>",
                )
            )
            db.insert_digest(
                run_date=now_iso()[:10],
                subject=subject,
                text=text,
                to_email=profile.digest_email or profile.email,
                status="sent" if delivery.transport == "smtp" and delivery.ok else "outbox" if delivery.ok else "failed",
                transport=delivery.transport,
                path=str(digest_path),
            )
            log.add("digest", f"{subject} — {delivery.detail}", "info" if delivery.ok else "error")

        db.finish_run(run.id, "success", stats, log.entries)
        return {
            "run_id": run.id,
            "status": "success",
            "stats": stats.model_dump(),
            "log": [entry.model_dump() for entry in log.entries],
            "digest_path": str(digest_path) if digest_path else None,
        }
    except Exception as exc:
        log.add("error", str(exc), "error")
        db.finish_run(run.id, "failed", stats, log.entries, error=str(exc))
        raise


def _review_reason(autopilot: bool, channel: str, remaining_cap: int) -> str:
    if channel == "external_form":
        return "ATS form — tailored pack is ready; the final submit is yours."
    if not autopilot:
        return "Autopilot is off, so this email application is prepared and waiting for approval."
    if remaining_cap <= 0:
        return "Daily application cap reached; prepared for tomorrow rather than sent."
    return "Prepared and waiting for review."
