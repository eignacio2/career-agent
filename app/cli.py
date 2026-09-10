"""Command-line interface — this is the interview surface.

    python -m app run --offline
    python -m app queued
    python -m app applications
    python -m app digest
    python -m app linkedin
    python -m app status
    python -m app send 3
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app import db
from app.apply import submit_by_email
from app.models import TailoredApplication
from app.pipeline import RunInProgress, run_agent
from app.tailor import tailor_application


def _print_job_row(job) -> None:
    score = f"{job.score:>3}" if job.score is not None else "  —"
    remote = "remote" if job.remote else job.location
    print(f"{job.status.upper():<10} {score}  {job.title}  —  {job.company}  ({remote})")
    if job.score_reasons:
        print(f"{'':>14}{job.score_reasons[0]}")
    print(f"{'':>14}{job.url}")


def cmd_run(args: argparse.Namespace) -> int:
    try:
        result = run_agent(
            trigger="cli",
            offline=True if args.offline else None,
            limit_per_source=args.limit,
            send_digest=not args.no_digest,
        )
    except RunInProgress as exc:
        print(exc, file=sys.stderr)
        return 1
    stats = result["stats"]
    print(
        f"Run {result['run_id']} {result['status']}: "
        f"discovered {stats['discovered']}, scored {stats['scored']}, "
        f"queued {stats['queued']}, submitted {stats['submitted']}, "
        f"awaiting review {stats['awaiting_review']}, skipped {stats['skipped']}, "
        f"top {stats['top_score']}"
    )
    for entry in result["log"]:
        print(f"  [{entry['step']}] {entry['message']}")
    if result.get("digest_path"):
        print(f"\nDigest: {result['digest_path']}")
    print("\nQueued now:")
    queued = db.list_jobs(status=["queued"], limit=20)
    if not queued:
        print("  (none)")
    for job in queued:
        _print_job_row(job)
    return 0


def cmd_queued(_args: argparse.Namespace) -> int:
    jobs = db.list_jobs(status=["queued"], limit=50)
    if not jobs:
        print("Nothing queued. Run: python -m app run --offline")
        return 0
    print(f"{len(jobs)} queued (crosses your threshold — go apply or python -m app send <id>)\n")
    for job in jobs:
        _print_job_row(job)
        print()
    return 0


def cmd_applications(_args: argparse.Namespace) -> int:
    apps = db.list_applications(limit=50)
    if not apps:
        print("No application packs yet. Run: python -m app run --offline")
        return 0
    for app in apps:
        job = app.job
        title = job.title if job else f"job {app.job_id}"
        company = job.company if job else ""
        print(f"#{app.id}  {app.status:<22} {app.channel:<14} {title} — {company}")
        print(f"      .data/applications/{app.id}/")
        if job:
            print(f"      {job.url}")
        if app.notes:
            print(f"      {app.notes}")
        print()
    return 0


def cmd_digest(_args: argparse.Namespace) -> int:
    digest = db.latest_digest()
    if not digest:
        print("No digest yet. Run: python -m app run --offline")
        return 0
    print(digest.subject)
    print()
    print(digest.text)
    if digest.path:
        print(f"\nFile: {digest.path}")
    return 0


def cmd_linkedin(_args: argparse.Namespace) -> int:
    pack = db.latest_linkedin_pack()
    if pack is None:
        print("No pack yet. Run: python -m app run --offline")
        return 0
    from app import config
    from app.linkedin import render_linkedin_markdown

    print(render_linkedin_markdown(pack))
    print(f"\nFile: {config.DATA_DIR / 'linkedin-pack.md'}")
    return 0


def cmd_status(_args: argparse.Namespace) -> int:
    profile = db.get_profile()
    counts = db.count_jobs()
    run = db.latest_run()
    print(f"{profile.full_name}  ·  {profile.experience_level}  ·  ceiling {profile.max_years_required} yrs")
    print(f"Threshold {profile.auto_apply_threshold}  ·  autopilot {profile.autopilot_enabled}")
    print(f"Jobs: {counts}")
    if run:
        print(f"Last run #{run.id} {run.status} at {run.started_at}  stats={run.stats.model_dump()}")
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    job = db.get_job(args.job_id)
    if job is None:
        print(f"No job {args.job_id}", file=sys.stderr)
        return 1
    print(f"{job.title} — {job.company}")
    print(f"{job.location}  remote={job.remote}  {job.url}")
    print(f"score {job.score}  {job.score_verdict}  status={job.status}")
    print("\nWhy")
    for reason in job.score_reasons:
        print(f"  - {reason}")
    print("\nGaps")
    for gap in job.score_gaps:
        print(f"  - {gap}")
    app = db.get_application_for_job(job.id)
    if app:
        print(f"\nApplication #{app.id} ({app.status}, {app.channel})")
        print(f"  .data/applications/{app.id}/")
    return 0


def cmd_send(args: argparse.Namespace) -> int:
    application = db.get_application(args.application_id)
    if application is None or application.job is None:
        print(f"No application {args.application_id}", file=sys.stderr)
        return 1
    job = application.job
    if not job.apply_email:
        print("This posting has no apply email. Open the URL and submit the form yourself.")
        print(job.url)
        return 1
    tailored = TailoredApplication(
        resume_markdown=application.resume_markdown,
        cover_letter=application.cover_letter,
        notes=application.tailoring_notes,
    )
    sent, _result, message = submit_by_email(job, db.get_profile(), tailored)
    if sent:
        db.upsert_application(
            job_id=job.id,
            status="submitted",
            channel="email",
            resume_markdown=application.resume_markdown,
            cover_letter=application.cover_letter,
            tailoring_notes=application.tailoring_notes,
            run_id=application.run_id,
            notes=message,
            submitted_at=__import__("app.models", fromlist=["now_iso"]).now_iso(),
            job_status="applied",
        )
        print(message)
        return 0
    print(message)
    return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app",
        description="New-grad AI engineering / forward deployed engineering job-search agent.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run", help="Discover, score, tailor, digest")
    run.add_argument("--offline", action="store_true", help="Use the bundled sample board")
    run.add_argument("--no-digest", action="store_true")
    run.add_argument("--limit", type=int, default=25)
    run.set_defaults(func=cmd_run)

    queued = sub.add_parser("queued", help="Print jobs that cleared the threshold")
    queued.set_defaults(func=cmd_queued)

    apps = sub.add_parser("applications", help="List tailored packs")
    apps.set_defaults(func=cmd_applications)

    digest = sub.add_parser("digest", help="Print the latest daily digest")
    digest.set_defaults(func=cmd_digest)

    linkedin = sub.add_parser("linkedin", help="Print the LinkedIn copy-paste pack")
    linkedin.set_defaults(func=cmd_linkedin)

    status = sub.add_parser("status", help="Profile + job counts")
    status.set_defaults(func=cmd_status)

    show = sub.add_parser("show", help="One job, with score reasons")
    show.add_argument("job_id", type=int)
    show.set_defaults(func=cmd_show)

    send = sub.add_parser("send", help="Email a prepared application (needs apply address)")
    send.add_argument("application_id", type=int)
    send.set_defaults(func=cmd_send)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)
