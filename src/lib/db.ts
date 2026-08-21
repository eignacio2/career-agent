import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_DIR = path.join(process.cwd(), ".data");

function resolveDbPath(): string {
  if (process.env.CAREER_AGENT_DB) return process.env.CAREER_AGENT_DB;
  return path.join(DEFAULT_DIR, "career-agent.db");
}

// Next.js dev server reloads modules on edit; caching on globalThis keeps a
// single connection so SQLite write locks don't collide between reloads.
const globalForDb = globalThis as unknown as { careerAgentDb?: Database.Database };

function migrate(db: Database.Database) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
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
      html TEXT NOT NULL,
      text TEXT NOT NULL,
      to_email TEXT NOT NULL,
      status TEXT NOT NULL,
      transport TEXT NOT NULL DEFAULT 'outbox',
      sent_at TEXT,
      error TEXT,
      stats TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS linkedin_packs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      headline TEXT NOT NULL,
      about TEXT NOT NULL,
      skills TEXT NOT NULL DEFAULT '[]',
      experience_rewrites TEXT NOT NULL DEFAULT '[]',
      open_to_work TEXT NOT NULL DEFAULT '',
      rationale TEXT NOT NULL DEFAULT '[]',
      changes TEXT NOT NULL DEFAULT '[]',
      generated_by TEXT NOT NULL DEFAULT 'heuristic',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS linkedin_snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      captured_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_score ON jobs(score DESC);
    CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
    CREATE INDEX IF NOT EXISTS idx_digests_created ON digests(created_at DESC);
  `);

  // CREATE TABLE IF NOT EXISTS leaves existing tables untouched, so columns added
  // after a database was first created have to be applied separately.
  addColumnIfMissing(db, "linkedin_packs", "changes", "TEXT NOT NULL DEFAULT '[]'");
}

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.length === 0) return;
  if (columns.some((entry) => entry.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function getDb(): Database.Database {
  if (globalForDb.careerAgentDb) return globalForDb.careerAgentDb;

  const dbPath = resolveDbPath();
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  migrate(db);
  globalForDb.careerAgentDb = db;
  return db;
}
