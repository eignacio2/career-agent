"""One agent run: discover → title filter → store → score → queue or skip.

This slice stops at "queued". It does not send applications, tailor a resume,
or email a digest. Those come back only after this core path has tests and
you can explain it.
"""

from __future__ import annotations

import threading

from app import db
from app.models import Job, RunLogEntry, RunStats, now_iso
from app.scoring.score import score_job
from app.sources.discover import discover
from app.sources.filter import classify_role, is_plausible_target

# In-process lock. The TypeScript v1 checked isRunInProgress() then wrote —
# two concurrent POSTs could both pass the check. This lock closes that hole
# inside one process. Two processes still need a DB lock; that is later work.
_run_lock = threading.Lock()


class RunInProgress(RuntimeError):
    pass


class RunLog:
    def __init__(self) -> None:
        self.entries: list[RunLogEntry] = []

    def add(self, step: str, message: str, level: str = "info") -> None:
        self.entries.append(
            RunLogEntry(at=now_iso(), step=step, message=message, level=level)  # type: ignore[arg-type]
        )


def run_agent(*, trigger: str, limit_per_source: int = 25, offline: bool | None = None) -> dict:
    if not _run_lock.acquire(blocking=False):
        raise RunInProgress("An agent run is already in progress.")
    try:
        if db.is_run_in_progress():
            raise RunInProgress("An agent run is already in progress.")
        return _run(trigger=trigger, limit_per_source=limit_per_source, offline=offline)
    finally:
        _run_lock.release()


def _run(*, trigger: str, limit_per_source: int, offline: bool | None) -> dict:
    run = db.create_run(trigger)
    log = RunLog()
    stats = RunStats()

    try:
        profile = db.get_profile()
        resume = db.get_resume()
        log.add(
            "start",
            (
                f"Run triggered by {trigger}. Scoring is heuristic-only "
                f"(no LLM in this slice). Experience level: {profile.experience_level}, "
                f"years ceiling: {profile.max_years_required}."
            ),
        )

        queries = profile.target_titles or ["data scientist", "ai engineer"]
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

        plausible = [
            job
            for job in discovery.jobs
            if is_plausible_target(job, include_internships=profile.include_internships)
        ]
        log.add(
            "filter",
            (
                f"{len(plausible)} of {len(discovery.jobs)} postings passed the "
                "title pre-filter for data science and AI engineering work."
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

        pending = [job for job in db.list_jobs(status=["new"], limit=60, unscored_only=True)]
        seen_ids = {job.id for job in fresh}
        to_score = fresh + [job for job in pending if job.id not in seen_ids]
        stats.discovered = len(fresh)
        log.add(
            "dedupe",
            (
                f"{len(fresh)} postings were new; "
                f"{len(plausible) - len(fresh)} had already been seen. "
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
            elif match.score >= max(0, threshold - 12):
                status = "shortlisted"
            else:
                status = "skipped"
            db.record_score(job.id, match.score, match.verdict, match.reasons, match.gaps, status)
            scored.append(
                job.model_copy(
                    update={
                        "score": match.score,
                        "score_verdict": match.verdict,
                        "score_reasons": match.reasons,
                        "score_gaps": match.gaps,
                        "status": status,
                    }
                )
            )
            if status == "queued":
                stats.queued += 1
            elif status == "skipped":
                stats.skipped += 1

        stats.scored = len(scored)
        stats.top_score = max((job.score or 0 for job in scored), default=0)
        scored.sort(key=lambda job: job.score or 0, reverse=True)

        if scored:
            top = scored[0]
            log.add(
                "score",
                (
                    f"Scored {len(scored)} postings. Top: {top.title} at {top.company} "
                    f"({top.score}). Queued {stats.queued} at threshold {threshold}; "
                    f"skipped {stats.skipped}."
                ),
            )
        else:
            log.add("score", "Nothing new to score.")

        log.add(
            "done",
            "This slice does not send applications. Open Queued jobs and apply yourself.",
        )

        db.finish_run(run.id, "success", stats, log.entries)
        return {
            "run_id": run.id,
            "status": "success",
            "stats": stats.model_dump(),
            "log": [entry.model_dump() for entry in log.entries],
            "top_jobs": [job.model_dump() for job in scored[:8]],
        }
    except Exception as exc:
        log.add("error", str(exc), "error")
        db.finish_run(run.id, "failed", stats, log.entries, error=str(exc))
        raise
