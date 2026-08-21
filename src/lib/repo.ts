import { getDb } from "./db";
import type { LinkedInSnapshot } from "./import/linkedin";
import { DEFAULT_PROFILE, DEFAULT_RESUME } from "./seed";
import type {
  AgentRun,
  Application,
  ApplicationStatus,
  Digest,
  DigestStats,
  Job,
  JobStatus,
  LinkedInChange,
  LinkedInPack,
  Profile,
  Resume,
  RunLogEntry,
  RunStatus,
} from "./types";

const now = () => new Date().toISOString();

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const EMPTY_STATS: DigestStats = {
  discovered: 0,
  scored: 0,
  submitted: 0,
  awaitingReview: 0,
  skipped: 0,
  topScore: 0,
};

/* ---------------------------------- profile --------------------------------- */

export function getProfile(): Profile {
  const db = getDb();
  const row = db.prepare("SELECT data, updated_at FROM profile WHERE id = 1").get() as
    | { data: string; updated_at: string }
    | undefined;

  if (!row) {
    const timestamp = now();
    db.prepare("INSERT INTO profile (id, data, updated_at) VALUES (1, ?, ?)").run(
      JSON.stringify(DEFAULT_PROFILE),
      timestamp,
    );
    return { id: 1, ...DEFAULT_PROFILE, updatedAt: timestamp };
  }

  const stored = parseJson<Partial<Profile>>(row.data, {});
  return { id: 1, ...DEFAULT_PROFILE, ...stored, updatedAt: row.updated_at };
}

export function saveProfile(patch: Partial<Profile>): Profile {
  const db = getDb();
  const current = getProfile();
  const merged = { ...current, ...patch };
  const timestamp = now();
  const data: Record<string, unknown> = { ...merged };
  delete data.id;
  delete data.updatedAt;

  db.prepare(
    `INSERT INTO profile (id, data, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(JSON.stringify(data), timestamp);

  return { ...merged, id: 1, updatedAt: timestamp };
}

/* ---------------------------------- resume ---------------------------------- */

export function getResume(): Resume {
  const db = getDb();
  const row = db.prepare("SELECT data FROM resume WHERE id = 1").get() as
    | { data: string }
    | undefined;

  if (!row) {
    db.prepare("INSERT INTO resume (id, data, updated_at) VALUES (1, ?, ?)").run(
      JSON.stringify(DEFAULT_RESUME),
      now(),
    );
    return DEFAULT_RESUME;
  }

  return parseJson<Resume>(row.data, DEFAULT_RESUME);
}

export function saveResume(resume: Resume): Resume {
  getDb()
    .prepare(
      `INSERT INTO resume (id, data, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(JSON.stringify(resume), now());
  return resume;
}

/* ----------------------------------- jobs ----------------------------------- */

type JobRow = Record<string, unknown>;

function mapJob(row: JobRow): Job {
  return {
    id: row.id as number,
    source: row.source as string,
    sourceId: row.source_id as string,
    title: row.title as string,
    company: row.company as string,
    location: row.location as string,
    remote: Boolean(row.remote),
    url: row.url as string,
    applyEmail: (row.apply_email as string | null) ?? null,
    description: row.description as string,
    salaryText: (row.salary_text as string | null) ?? null,
    tags: parseJson<string[]>(row.tags, []),
    roleFamily: row.role_family as Job["roleFamily"],
    earlyCareer: Boolean(row.early_career),
    postedAt: (row.posted_at as string | null) ?? null,
    discoveredAt: row.discovered_at as string,
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    scoreVerdict: (row.score_verdict as string | null) ?? null,
    scoreReasons: parseJson<string[]>(row.score_reasons, []),
    scoreGaps: parseJson<string[]>(row.score_gaps, []),
    status: row.status as JobStatus,
    decidedAt: (row.decided_at as string | null) ?? null,
    runId: (row.run_id as number | null) ?? null,
  };
}

export type NewJob = Omit<
  Job,
  "id" | "discoveredAt" | "score" | "scoreVerdict" | "scoreReasons" | "scoreGaps" | "status" | "decidedAt"
>;

/** Returns the inserted job, or null when the posting was already known. */
export function insertJobIfNew(job: NewJob): Job | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM jobs WHERE source = ? AND source_id = ?")
    .get(job.source, job.sourceId) as { id: number } | undefined;
  if (existing) return null;

  const info = db
    .prepare(
      `INSERT INTO jobs (source, source_id, title, company, location, remote, url, apply_email,
        description, salary_text, tags, role_family, early_career, posted_at, discovered_at, status, run_id)
       VALUES (@source, @sourceId, @title, @company, @location, @remote, @url, @applyEmail,
        @description, @salaryText, @tags, @roleFamily, @earlyCareer, @postedAt, @discoveredAt, 'new', @runId)`,
    )
    .run({
      source: job.source,
      sourceId: job.sourceId,
      title: job.title,
      company: job.company,
      location: job.location,
      remote: job.remote ? 1 : 0,
      url: job.url,
      applyEmail: job.applyEmail,
      description: job.description,
      salaryText: job.salaryText,
      tags: JSON.stringify(job.tags),
      roleFamily: job.roleFamily,
      earlyCareer: job.earlyCareer ? 1 : 0,
      postedAt: job.postedAt,
      discoveredAt: now(),
      runId: job.runId,
    });

  return getJob(Number(info.lastInsertRowid));
}

export function getJob(id: number): Job | null {
  const row = getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
  return row ? mapJob(row) : null;
}

export function listJobs(options: { status?: JobStatus[]; limit?: number } = {}): Job[] {
  const db = getDb();
  const limit = options.limit ?? 200;

  if (options.status?.length) {
    const placeholders = options.status.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT * FROM jobs WHERE status IN (${placeholders})
         ORDER BY COALESCE(score, -1) DESC, discovered_at DESC LIMIT ?`,
      )
      .all(...options.status, limit) as JobRow[];
    return rows.map(mapJob);
  }

  const rows = db
    .prepare(
      "SELECT * FROM jobs ORDER BY COALESCE(score, -1) DESC, discovered_at DESC LIMIT ?",
    )
    .all(limit) as JobRow[];
  return rows.map(mapJob);
}

export function updateJobScore(
  id: number,
  score: number,
  verdict: string,
  reasons: string[],
  gaps: string[],
): void {
  getDb()
    .prepare(
      "UPDATE jobs SET score = ?, score_verdict = ?, score_reasons = ?, score_gaps = ? WHERE id = ?",
    )
    .run(score, verdict, JSON.stringify(reasons), JSON.stringify(gaps), id);
}

export function updateJobStatus(id: number, status: JobStatus): void {
  getDb()
    .prepare("UPDATE jobs SET status = ?, decided_at = ? WHERE id = ?")
    .run(status, now(), id);
}

export function countJobs(): Record<JobStatus | "total", number> {
  const rows = getDb()
    .prepare("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status")
    .all() as { status: JobStatus; n: number }[];

  const counts = {
    total: 0,
    new: 0,
    shortlisted: 0,
    queued: 0,
    applied: 0,
    skipped: 0,
    expired: 0,
  };
  for (const row of rows) {
    counts[row.status] = row.n;
    counts.total += row.n;
  }
  return counts;
}

/* ------------------------------- applications ------------------------------- */

function mapApplication(row: JobRow): Application {
  return {
    id: row.id as number,
    jobId: row.job_id as number,
    status: row.status as ApplicationStatus,
    channel: row.channel as Application["channel"],
    resumeMarkdown: row.resume_markdown as string,
    coverLetter: row.cover_letter as string,
    tailoringNotes: parseJson<string[]>(row.tailoring_notes, []),
    submittedAt: (row.submitted_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    error: (row.error as string | null) ?? null,
    notes: (row.notes as string) ?? "",
    runId: (row.run_id as number | null) ?? null,
  };
}

export interface NewApplication {
  jobId: number;
  status: ApplicationStatus;
  channel: Application["channel"];
  resumeMarkdown: string;
  coverLetter: string;
  tailoringNotes: string[];
  submittedAt?: string | null;
  error?: string | null;
  notes?: string;
  runId?: number | null;
}

export function upsertApplication(input: NewApplication): Application {
  const db = getDb();
  const timestamp = now();

  db.prepare(
    `INSERT INTO applications (job_id, status, channel, resume_markdown, cover_letter,
      tailoring_notes, submitted_at, created_at, updated_at, error, notes, run_id)
     VALUES (@jobId, @status, @channel, @resumeMarkdown, @coverLetter, @tailoringNotes,
      @submittedAt, @timestamp, @timestamp, @error, @notes, @runId)
     ON CONFLICT(job_id) DO UPDATE SET
      status = excluded.status,
      channel = excluded.channel,
      resume_markdown = excluded.resume_markdown,
      cover_letter = excluded.cover_letter,
      tailoring_notes = excluded.tailoring_notes,
      submitted_at = excluded.submitted_at,
      updated_at = excluded.updated_at,
      error = excluded.error,
      notes = excluded.notes,
      run_id = excluded.run_id`,
  ).run({
    jobId: input.jobId,
    status: input.status,
    channel: input.channel,
    resumeMarkdown: input.resumeMarkdown,
    coverLetter: input.coverLetter,
    tailoringNotes: JSON.stringify(input.tailoringNotes),
    submittedAt: input.submittedAt ?? null,
    timestamp,
    error: input.error ?? null,
    notes: input.notes ?? "",
    runId: input.runId ?? null,
  });

  const row = db
    .prepare("SELECT * FROM applications WHERE job_id = ?")
    .get(input.jobId) as JobRow;
  return mapApplication(row);
}

export function getApplication(id: number): Application | null {
  const row = getDb().prepare("SELECT * FROM applications WHERE id = ?").get(id) as
    | JobRow
    | undefined;
  if (!row) return null;
  const app = mapApplication(row);
  app.job = getJob(app.jobId) ?? undefined;
  return app;
}

export function listApplications(
  options: { status?: ApplicationStatus[]; limit?: number; since?: string } = {},
): Application[] {
  const db = getDb();
  const limit = options.limit ?? 200;
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.status?.length) {
    clauses.push(`a.status IN (${options.status.map(() => "?").join(", ")})`);
    params.push(...options.status);
  }
  if (options.since) {
    clauses.push("a.updated_at >= ?");
    params.push(options.since);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT a.* FROM applications a ${where} ORDER BY a.updated_at DESC LIMIT ?`,
    )
    .all(...params, limit) as JobRow[];

  return rows.map((row) => {
    const app = mapApplication(row);
    app.job = getJob(app.jobId) ?? undefined;
    return app;
  });
}

export function updateApplication(
  id: number,
  patch: Partial<Pick<Application, "status" | "notes" | "submittedAt" | "error" | "coverLetter" | "resumeMarkdown">>,
): Application | null {
  const db = getDb();
  const fields: string[] = [];
  const params: unknown[] = [];
  const columns: Record<string, string> = {
    status: "status",
    notes: "notes",
    submittedAt: "submitted_at",
    error: "error",
    coverLetter: "cover_letter",
    resumeMarkdown: "resume_markdown",
  };

  for (const [key, column] of Object.entries(columns)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value !== undefined) {
      fields.push(`${column} = ?`);
      params.push(value);
    }
  }
  if (!fields.length) return getApplication(id);

  fields.push("updated_at = ?");
  params.push(now(), id);
  db.prepare(`UPDATE applications SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  return getApplication(id);
}

export function countApplicationsSince(isoDate: string): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM applications WHERE submitted_at IS NOT NULL AND submitted_at >= ?",
    )
    .get(isoDate) as { n: number };
  return row.n;
}

export function countApplications(): Record<string, number> {
  const rows = getDb()
    .prepare("SELECT status, COUNT(*) AS n FROM applications GROUP BY status")
    .all() as { status: string; n: number }[];
  const counts: Record<string, number> = { total: 0 };
  for (const row of rows) {
    counts[row.status] = row.n;
    counts.total += row.n;
  }
  return counts;
}

/* ----------------------------------- runs ----------------------------------- */

function mapRun(row: JobRow): AgentRun {
  return {
    id: row.id as number,
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string | null) ?? null,
    status: row.status as RunStatus,
    trigger: row.trigger as string,
    stats: parseJson<DigestStats>(row.stats, EMPTY_STATS),
    log: parseJson<RunLogEntry[]>(row.log, []),
    error: (row.error as string | null) ?? null,
  };
}

export function createRun(trigger: string): AgentRun {
  const info = getDb()
    .prepare(
      "INSERT INTO runs (started_at, status, trigger, stats, log) VALUES (?, 'running', ?, '{}', '[]')",
    )
    .run(now(), trigger);
  return getRun(Number(info.lastInsertRowid))!;
}

export function getRun(id: number): AgentRun | null {
  const row = getDb().prepare("SELECT * FROM runs WHERE id = ?").get(id) as JobRow | undefined;
  return row ? mapRun(row) : null;
}

export function finishRun(
  id: number,
  status: RunStatus,
  stats: DigestStats,
  log: RunLogEntry[],
  error?: string | null,
): void {
  getDb()
    .prepare(
      "UPDATE runs SET finished_at = ?, status = ?, stats = ?, log = ?, error = ? WHERE id = ?",
    )
    .run(now(), status, JSON.stringify(stats), JSON.stringify(log), error ?? null, id);
}

export function listRuns(limit = 20): AgentRun[] {
  const rows = getDb()
    .prepare("SELECT * FROM runs ORDER BY started_at DESC LIMIT ?")
    .all(limit) as JobRow[];
  return rows.map(mapRun);
}

export function isRunInProgress(): boolean {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM runs WHERE status = 'running'")
    .get() as { n: number };
  return row.n > 0;
}

/* ---------------------------------- digests --------------------------------- */

function mapDigest(row: JobRow): Digest {
  return {
    id: row.id as number,
    runDate: row.run_date as string,
    subject: row.subject as string,
    html: row.html as string,
    text: row.text as string,
    toEmail: row.to_email as string,
    status: row.status as Digest["status"],
    transport: row.transport as string,
    sentAt: (row.sent_at as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    stats: parseJson<DigestStats>(row.stats, EMPTY_STATS),
    createdAt: row.created_at as string,
  };
}

export function insertDigest(input: Omit<Digest, "id" | "createdAt">): Digest {
  const info = getDb()
    .prepare(
      `INSERT INTO digests (run_date, subject, html, text, to_email, status, transport, sent_at, error, stats, created_at)
       VALUES (@runDate, @subject, @html, @text, @toEmail, @status, @transport, @sentAt, @error, @stats, @createdAt)`,
    )
    .run({
      runDate: input.runDate,
      subject: input.subject,
      html: input.html,
      text: input.text,
      toEmail: input.toEmail,
      status: input.status,
      transport: input.transport,
      sentAt: input.sentAt,
      error: input.error,
      stats: JSON.stringify(input.stats),
      createdAt: now(),
    });
  return getDigest(Number(info.lastInsertRowid))!;
}

export function getDigest(id: number): Digest | null {
  const row = getDb().prepare("SELECT * FROM digests WHERE id = ?").get(id) as
    | JobRow
    | undefined;
  return row ? mapDigest(row) : null;
}

export function listDigests(limit = 30): Digest[] {
  const rows = getDb()
    .prepare("SELECT * FROM digests ORDER BY created_at DESC LIMIT ?")
    .all(limit) as JobRow[];
  return rows.map(mapDigest);
}

export function markDigestSent(
  id: number,
  status: Digest["status"],
  transport: string,
  error?: string | null,
): void {
  getDb()
    .prepare("UPDATE digests SET status = ?, transport = ?, sent_at = ?, error = ? WHERE id = ?")
    .run(status, transport, status === "sent" ? now() : null, error ?? null, id);
}

/* ------------------------------- linkedin packs ------------------------------ */

function mapPack(row: JobRow): LinkedInPack {
  return {
    id: row.id as number,
    headline: row.headline as string,
    about: row.about as string,
    skills: parseJson<string[]>(row.skills, []),
    experienceRewrites: parseJson<LinkedInPack["experienceRewrites"]>(
      row.experience_rewrites,
      [],
    ),
    openToWork: row.open_to_work as string,
    rationale: parseJson<string[]>(row.rationale, []),
    changes: parseJson<LinkedInChange[]>(row.changes, []),
    generatedBy: row.generated_by as string,
    createdAt: row.created_at as string,
  };
}

export function insertLinkedInPack(pack: Omit<LinkedInPack, "id" | "createdAt">): LinkedInPack {
  const info = getDb()
    .prepare(
      `INSERT INTO linkedin_packs (headline, about, skills, experience_rewrites, open_to_work, rationale, changes, generated_by, created_at)
       VALUES (@headline, @about, @skills, @experienceRewrites, @openToWork, @rationale, @changes, @generatedBy, @createdAt)`,
    )
    .run({
      headline: pack.headline,
      about: pack.about,
      skills: JSON.stringify(pack.skills),
      experienceRewrites: JSON.stringify(pack.experienceRewrites),
      openToWork: pack.openToWork,
      rationale: JSON.stringify(pack.rationale),
      changes: JSON.stringify(pack.changes ?? []),
      generatedBy: pack.generatedBy,
      createdAt: now(),
    });
  const row = getDb()
    .prepare("SELECT * FROM linkedin_packs WHERE id = ?")
    .get(Number(info.lastInsertRowid)) as JobRow;
  return mapPack(row);
}

export function getLatestLinkedInPack(): LinkedInPack | null {
  const row = getDb()
    .prepare("SELECT * FROM linkedin_packs ORDER BY created_at DESC LIMIT 1")
    .get() as JobRow | undefined;
  return row ? mapPack(row) : null;
}

/* ---------------------------- linkedin snapshot ---------------------------- */

export interface StoredSnapshot {
  snapshot: LinkedInSnapshot;
  capturedAt: string;
}

export function saveLinkedInSnapshot(snapshot: LinkedInSnapshot): StoredSnapshot {
  const capturedAt = now();
  getDb()
    .prepare(
      `INSERT INTO linkedin_snapshot (id, data, captured_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, captured_at = excluded.captured_at`,
    )
    .run(JSON.stringify(snapshot), capturedAt);
  return { snapshot, capturedAt };
}

export function getLinkedInSnapshot(): StoredSnapshot | null {
  const row = getDb()
    .prepare("SELECT data, captured_at FROM linkedin_snapshot WHERE id = 1")
    .get() as { data: string; captured_at: string } | undefined;
  if (!row) return null;

  const snapshot = parseJson<LinkedInSnapshot | null>(row.data, null);
  return snapshot ? { snapshot, capturedAt: row.captured_at } : null;
}
