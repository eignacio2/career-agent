"""SQLite persistence.

One file, WAL mode, foreign keys on. Profile and resume are JSON documents in
single-row tables (id CHECK = 1) because they are singleton config, not a
collection. Jobs and runs are real rows.

The TypeScript v1 wrote application status and job status in two statements
with no transaction. A crash between them left the two tables disagreeing.
This slice scores and updates job status in one transaction so that cannot
happen for the writes we still make.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

from app import config
from app.models import (
    AgentRun,
    Application,
    Digest,
    Job,
    JobRole,
    JobStatus,
    LinkedInPack,
    Profile,
    Resume,
    RunLogEntry,
    RunStats,
    now_iso,
)
from app.profile import DEFAULT_PROFILE, DEFAULT_RESUME

_local = threading.local()


def _connect() -> sqlite3.Connection:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    if config.DB_PATH != Path(":memory:"):
        config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_conn() -> sqlite3.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = _connect()
        _migrate(conn)
        _local.conn = conn
    return conn


def reset_connection() -> None:
    """Used by tests that point CAREER_AGENT_DB at a temp file."""
    conn = getattr(_local, "conn", None)
    if conn is not None:
        conn.close()
        _local.conn = None


@contextmanager
def transaction():
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def _migrate(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS profile (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          data TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS resume (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          data TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          status TEXT NOT NULL,
          trigger TEXT NOT NULL,
          stats TEXT NOT NULL DEFAULT '{}',
          log TEXT NOT NULL DEFAULT '[]',
          error TEXT
        );

        CREATE TABLE IF NOT EXISTS jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source TEXT NOT NULL,
          source_id TEXT NOT NULL,
          title TEXT NOT NULL,
          company TEXT NOT NULL,
          location TEXT NOT NULL DEFAULT '',
          remote INTEGER NOT NULL DEFAULT 0,
          url TEXT NOT NULL,
          apply_email TEXT,
          description TEXT NOT NULL DEFAULT '',
          salary_text TEXT,
          tags TEXT NOT NULL DEFAULT '[]',
          role_family TEXT NOT NULL DEFAULT 'adjacent',
          early_career INTEGER NOT NULL DEFAULT 0,
          posted_at TEXT,
          discovered_at TEXT NOT NULL,
          score REAL,
          score_verdict TEXT,
          score_reasons TEXT NOT NULL DEFAULT '[]',
          score_gaps TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'new',
          decided_at TEXT,
          run_id INTEGER,
          UNIQUE (source, source_id)
        );

        CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
        CREATE INDEX IF NOT EXISTS idx_jobs_score ON jobs(score DESC);

        CREATE TABLE IF NOT EXISTS applications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
          status TEXT NOT NULL,
          channel TEXT NOT NULL,
          resume_markdown TEXT NOT NULL DEFAULT '',
          cover_letter TEXT NOT NULL DEFAULT '',
          tailoring_notes TEXT NOT NULL DEFAULT '[]',
          submitted_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          error TEXT,
          notes TEXT NOT NULL DEFAULT '',
          run_id INTEGER,
          UNIQUE (job_id)
        );

        CREATE TABLE IF NOT EXISTS digests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_date TEXT NOT NULL,
          subject TEXT NOT NULL,
          text TEXT NOT NULL,
          to_email TEXT NOT NULL,
          status TEXT NOT NULL,
          transport TEXT NOT NULL DEFAULT 'file',
          path TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS linkedin_packs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          data TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        """
    )
    conn.commit()
    _seed_if_empty(conn)
    _refresh_stale_search_defaults(conn)


def _seed_if_empty(conn: sqlite3.Connection) -> None:
    row = conn.execute("SELECT id FROM profile WHERE id = 1").fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO profile (id, data, updated_at) VALUES (1, ?, ?)",
            (DEFAULT_PROFILE.model_dump_json(), now_iso()),
        )
    row = conn.execute("SELECT id FROM resume WHERE id = 1").fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO resume (id, data, updated_at) VALUES (1, ?, ?)",
            (DEFAULT_RESUME.model_dump_json(), now_iso()),
        )
    conn.commit()


def _refresh_stale_search_defaults(conn: sqlite3.Connection) -> None:
    """Move a still-seeded DS search onto AI Engineer / FDE without clobbering custom titles."""
    row = conn.execute("SELECT data FROM profile WHERE id = 1").fetchone()
    if row is None:
        return
    data = json.loads(row["data"])
    titles = [str(item).lower() for item in data.get("target_titles") or []]
    looking_ds = any("data scientist" in item or item.strip() == "data science" for item in titles)
    looking_fde = any("forward deployed" in item for item in titles)
    changed = False
    if looking_ds and not looking_fde:
        data["target_titles"] = DEFAULT_PROFILE.target_titles
        data["headline"] = DEFAULT_PROFILE.headline
        data["summary"] = DEFAULT_PROFILE.summary
        changed = True
    if data.get("location_mode") in (None, "", "us-or-remote", "targets-or-remote"):
        data["location_mode"] = "chicago-office"
        data["target_locations"] = DEFAULT_PROFILE.target_locations
        data["remote_preference"] = "hybrid"
        changed = True
    if changed:
        conn.execute(
            "UPDATE profile SET data = ?, updated_at = ? WHERE id = 1",
            (json.dumps(data), now_iso()),
        )
        conn.commit()


def get_profile() -> Profile:
    row = get_conn().execute("SELECT data FROM profile WHERE id = 1").fetchone()
    return Profile.model_validate_json(row["data"])


def save_profile(profile: Profile) -> Profile:
    get_conn().execute(
        "UPDATE profile SET data = ?, updated_at = ? WHERE id = 1",
        (profile.model_dump_json(), now_iso()),
    )
    get_conn().commit()
    return profile


def get_resume() -> Resume:
    row = get_conn().execute("SELECT data FROM resume WHERE id = 1").fetchone()
    return Resume.model_validate_json(row["data"])


def save_resume(resume: Resume) -> Resume:
    get_conn().execute(
        "UPDATE resume SET data = ?, updated_at = ? WHERE id = 1",
        (resume.model_dump_json(), now_iso()),
    )
    get_conn().commit()
    return resume


def _job_from_row(row: sqlite3.Row) -> Job:
    return Job(
        id=row["id"],
        source=row["source"],
        source_id=row["source_id"],
        title=row["title"],
        company=row["company"],
        location=row["location"],
        remote=bool(row["remote"]),
        url=row["url"],
        apply_email=row["apply_email"],
        description=row["description"],
        salary_text=row["salary_text"],
        tags=json.loads(row["tags"]),
        role_family=row["role_family"],
        early_career=bool(row["early_career"]),
        posted_at=row["posted_at"],
        discovered_at=row["discovered_at"],
        score=int(row["score"]) if row["score"] is not None else None,
        score_verdict=row["score_verdict"],
        score_reasons=json.loads(row["score_reasons"]),
        score_gaps=json.loads(row["score_gaps"]),
        status=row["status"],
        decided_at=row["decided_at"],
        run_id=row["run_id"],
    )


def insert_job_if_new(
    *,
    source: str,
    source_id: str,
    title: str,
    company: str,
    location: str,
    remote: bool,
    url: str,
    apply_email: str | None,
    description: str,
    salary_text: str | None,
    tags: list[str],
    role_family: JobRole,
    early_career: bool,
    posted_at: str | None,
    run_id: int | None,
) -> Job | None:
    conn = get_conn()
    existing = conn.execute(
        "SELECT id FROM jobs WHERE source = ? AND source_id = ?",
        (source, source_id),
    ).fetchone()
    if existing:
        return None
    cur = conn.execute(
        """
        INSERT INTO jobs (
          source, source_id, title, company, location, remote, url, apply_email,
          description, salary_text, tags, role_family, early_career, posted_at,
          discovered_at, run_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            source,
            source_id,
            title,
            company,
            location,
            1 if remote else 0,
            url,
            apply_email,
            description,
            salary_text,
            json.dumps(tags),
            role_family,
            1 if early_career else 0,
            posted_at,
            now_iso(),
            run_id,
        ),
    )
    conn.commit()
    return get_job(cur.lastrowid)


def get_job(job_id: int) -> Job | None:
    row = get_conn().execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return _job_from_row(row) if row else None


def list_jobs(
    *,
    status: list[JobStatus] | None = None,
    limit: int = 200,
    unscored_only: bool = False,
) -> list[Job]:
    clauses: list[str] = []
    params: list[object] = []
    if status:
        placeholders = ",".join("?" for _ in status)
        clauses.append(f"status IN ({placeholders})")
        params.extend(status)
    if unscored_only:
        clauses.append("score IS NULL")
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = get_conn().execute(
        f"SELECT * FROM jobs {where} ORDER BY COALESCE(score, -1) DESC, id DESC LIMIT ?",
        [*params, limit],
    ).fetchall()
    return [_job_from_row(row) for row in rows]


def count_jobs() -> dict[str, int]:
    rows = get_conn().execute(
        "SELECT status, COUNT(*) AS n FROM jobs GROUP BY status"
    ).fetchall()
    counts = {row["status"]: row["n"] for row in rows}
    total = sum(counts.values())
    return {"total": total, **counts}


def record_score(job_id: int, score: int, verdict: str, reasons: list[str], gaps: list[str], status: JobStatus) -> None:
    """Score and status in one transaction — the two-write gap from v1."""
    with transaction() as conn:
        conn.execute(
            """
            UPDATE jobs
            SET score = ?, score_verdict = ?, score_reasons = ?, score_gaps = ?,
                status = ?, decided_at = ?
            WHERE id = ?
            """,
            (
                score,
                verdict,
                json.dumps(reasons),
                json.dumps(gaps),
                status,
                now_iso(),
                job_id,
            ),
        )


def create_run(trigger: str) -> AgentRun:
    cur = get_conn().execute(
        "INSERT INTO runs (started_at, status, trigger, stats, log) VALUES (?, 'running', ?, '{}', '[]')",
        (now_iso(), trigger),
    )
    get_conn().commit()
    run = get_run(cur.lastrowid)
    assert run is not None
    return run


def finish_run(run_id: int, status: str, stats: RunStats, log: list[RunLogEntry], error: str | None = None) -> None:
    get_conn().execute(
        """
        UPDATE runs
        SET finished_at = ?, status = ?, stats = ?, log = ?, error = ?
        WHERE id = ?
        """,
        (now_iso(), status, stats.model_dump_json(), json.dumps([e.model_dump() for e in log]), error, run_id),
    )
    get_conn().commit()


def get_run(run_id: int) -> AgentRun | None:
    row = get_conn().execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
    if not row:
        return None
    return _run_from_row(row)


def latest_run() -> AgentRun | None:
    row = get_conn().execute("SELECT * FROM runs ORDER BY id DESC LIMIT 1").fetchone()
    return _run_from_row(row) if row else None


def list_runs(limit: int = 10) -> list[AgentRun]:
    rows = get_conn().execute("SELECT * FROM runs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [_run_from_row(row) for row in rows]


def is_run_in_progress() -> bool:
    row = get_conn().execute(
        "SELECT id FROM runs WHERE status = 'running' LIMIT 1"
    ).fetchone()
    return row is not None


def _run_from_row(row: sqlite3.Row) -> AgentRun:
    return AgentRun(
        id=row["id"],
        started_at=row["started_at"],
        finished_at=row["finished_at"],
        status=row["status"],
        trigger=row["trigger"],
        stats=RunStats.model_validate_json(row["stats"] or "{}"),
        log=[RunLogEntry.model_validate(entry) for entry in json.loads(row["log"] or "[]")],
        error=row["error"],
    )


def _application_from_row(row: sqlite3.Row) -> Application:
    return Application(
        id=row["id"],
        job_id=row["job_id"],
        status=row["status"],
        channel=row["channel"],
        resume_markdown=row["resume_markdown"],
        cover_letter=row["cover_letter"],
        tailoring_notes=json.loads(row["tailoring_notes"] or "[]"),
        submitted_at=row["submitted_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        error=row["error"],
        notes=row["notes"] or "",
        run_id=row["run_id"],
        job=get_job(row["job_id"]),
    )


def get_application_for_job(job_id: int) -> Application | None:
    row = get_conn().execute("SELECT * FROM applications WHERE job_id = ?", (job_id,)).fetchone()
    return _application_from_row(row) if row else None


def get_application(application_id: int) -> Application | None:
    row = get_conn().execute("SELECT * FROM applications WHERE id = ?", (application_id,)).fetchone()
    return _application_from_row(row) if row else None


def list_applications(limit: int = 100) -> list[Application]:
    rows = get_conn().execute(
        "SELECT * FROM applications ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    return [_application_from_row(row) for row in rows]


def upsert_application(
    *,
    job_id: int,
    status: str,
    channel: str,
    resume_markdown: str,
    cover_letter: str,
    tailoring_notes: list[str],
    run_id: int | None,
    notes: str = "",
    error: str | None = None,
    submitted_at: str | None = None,
    job_status: JobStatus | None = None,
) -> Application:
    stamp = now_iso()
    with transaction() as conn:
        existing = conn.execute("SELECT id FROM applications WHERE job_id = ?", (job_id,)).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE applications
                SET status = ?, channel = ?, resume_markdown = ?, cover_letter = ?,
                    tailoring_notes = ?, submitted_at = COALESCE(?, submitted_at),
                    updated_at = ?, error = ?, notes = ?, run_id = ?
                WHERE job_id = ?
                """,
                (
                    status,
                    channel,
                    resume_markdown,
                    cover_letter,
                    json.dumps(tailoring_notes),
                    submitted_at,
                    stamp,
                    error,
                    notes,
                    run_id,
                    job_id,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO applications (
                  job_id, status, channel, resume_markdown, cover_letter, tailoring_notes,
                  submitted_at, created_at, updated_at, error, notes, run_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    status,
                    channel,
                    resume_markdown,
                    cover_letter,
                    json.dumps(tailoring_notes),
                    submitted_at,
                    stamp,
                    stamp,
                    error,
                    notes,
                    run_id,
                ),
            )
        if job_status:
            conn.execute(
                "UPDATE jobs SET status = ?, decided_at = ? WHERE id = ?",
                (job_status, stamp, job_id),
            )
    app = get_application_for_job(job_id)
    assert app is not None
    return app


def count_submitted_since(iso_stamp: str) -> int:
    row = get_conn().execute(
        "SELECT COUNT(*) AS n FROM applications WHERE status = 'submitted' AND submitted_at >= ?",
        (iso_stamp,),
    ).fetchone()
    return int(row["n"]) if row else 0


def insert_digest(*, run_date: str, subject: str, text: str, to_email: str, status: str, transport: str, path: str) -> Digest:
    cur = get_conn().execute(
        """
        INSERT INTO digests (run_date, subject, text, to_email, status, transport, path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (run_date, subject, text, to_email, status, transport, path, now_iso()),
    )
    get_conn().commit()
    return Digest(
        id=cur.lastrowid,
        run_date=run_date,
        subject=subject,
        text=text,
        to_email=to_email,
        status=status,
        transport=transport,
        path=path,
    )


def latest_digest() -> Digest | None:
    row = get_conn().execute("SELECT * FROM digests ORDER BY id DESC LIMIT 1").fetchone()
    if not row:
        return None
    return Digest(
        id=row["id"],
        run_date=row["run_date"],
        subject=row["subject"],
        text=row["text"],
        to_email=row["to_email"],
        status=row["status"],
        transport=row["transport"],
        path=row["path"] or "",
    )


def save_linkedin_pack(pack: LinkedInPack) -> None:
    get_conn().execute(
        "INSERT INTO linkedin_packs (data, created_at) VALUES (?, ?)",
        (pack.model_dump_json(), now_iso()),
    )
    get_conn().commit()


def latest_linkedin_pack() -> LinkedInPack | None:
    row = get_conn().execute("SELECT data FROM linkedin_packs ORDER BY id DESC LIMIT 1").fetchone()
    return LinkedInPack.model_validate_json(row["data"]) if row else None

