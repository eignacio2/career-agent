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
    Job,
    JobRole,
    JobStatus,
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
        """
    )
    conn.commit()
    _seed_if_empty(conn)


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
