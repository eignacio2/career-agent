import { isLlmConfigured, llmModelLabel } from "../llm";
import { isSmtpConfigured, sendMail } from "../mail";
import * as repo from "../repo";
import { classifyRole, discover, isPlausibleTarget } from "../sources";
import type { Application, DigestStats, Job, RunLogEntry, RunStatus } from "../types";
import { channelFor, submitByEmail } from "./apply";
import { buildDigest } from "./digest";
import { generateLinkedInPack } from "./linkedin";
import { scoreJob } from "./score";
import { tailorApplication } from "./tailor";

export interface RunOptions {
  trigger: string;
  appBaseUrl: string;
  sendDigest?: boolean;
  refreshLinkedIn?: boolean;
  limitPerSource?: number;
}

export interface RunResult {
  runId: number;
  status: RunStatus;
  stats: DigestStats;
  log: RunLogEntry[];
  digestId: number | null;
  digestTransport: string | null;
}

const SHORTLIST_MARGIN = 12;

function startOfUtcDay(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

class RunLog {
  readonly entries: RunLogEntry[] = [];

  add(step: string, message: string, level: RunLogEntry["level"] = "info") {
    this.entries.push({ at: new Date().toISOString(), step, message, level });
  }
}

export async function runAgent(options: RunOptions): Promise<RunResult> {
  const run = repo.createRun(options.trigger);
  const log = new RunLog();
  const stats: DigestStats = { ...repo.EMPTY_STATS };

  const submitted: { application: Application; job: Job }[] = [];
  const awaitingReview: { application: Application; job: Job }[] = [];
  const skipped: { job: Job; reason: string }[] = [];
  const notes: string[] = [];

  try {
    const profile = repo.getProfile();
    const resume = repo.getResume();

    log.add(
      "start",
      `Run triggered by ${options.trigger}. Reasoning engine: ${isLlmConfigured() ? llmModelLabel() : "built-in heuristics (no OPENAI_API_KEY set)"}.`,
    );
    if (!isLlmConfigured()) {
      notes.push(
        "No language model is configured, so scoring and tailoring used the built-in heuristic engine. Set OPENAI_API_KEY for materially better tailoring.",
      );
    }

    /* ------------------------------- discovery ------------------------------- */

    const queries = profile.targetTitles.length > 0 ? profile.targetTitles : ["data scientist", "ai engineer"];
    const discovery = await discover(queries, options.limitPerSource ?? 25);

    if (discovery.usedFallback) {
      log.add(
        "discover",
        `Live boards were unreachable (${discovery.sourcesFailed.join(", ") || "none responded"}), so the bundled sample board was used.`,
        "warn",
      );
      notes.push(
        "Live job boards were unreachable from this environment, so this run screened the bundled sample postings. The pipeline is otherwise identical.",
      );
    } else {
      log.add(
        "discover",
        `Queried ${discovery.sourcesUsed.join(", ")} for ${queries.length} target titles and got ${discovery.jobs.length} postings back.`,
      );
      if (discovery.sourcesFailed.length > 0) {
        log.add("discover", `No results from ${discovery.sourcesFailed.join(", ")}.`, "warn");
      }
    }

    const plausible = discovery.jobs.filter(isPlausibleTarget);
    log.add(
      "filter",
      `${plausible.length} of ${discovery.jobs.length} postings passed the pre-filter for data science and AI engineering work.`,
    );

    const freshJobs: Job[] = [];
    for (const candidate of plausible) {
      const inserted = repo.insertJobIfNew({
        source: candidate.source,
        sourceId: candidate.sourceId,
        title: candidate.title,
        company: candidate.company,
        location: candidate.location,
        remote: candidate.remote,
        url: candidate.url,
        applyEmail: candidate.applyEmail,
        description: candidate.description,
        salaryText: candidate.salaryText,
        tags: candidate.tags,
        roleFamily: classifyRole(candidate),
        postedAt: candidate.postedAt,
        runId: run.id,
      });
      if (inserted) freshJobs.push(inserted);
    }

    // Pick up anything a previous run stored but never got around to scoring.
    const pending = repo.listJobs({ status: ["new"], limit: 60 }).filter((job) => job.score === null);
    const toScore = [...freshJobs, ...pending.filter((job) => !freshJobs.some((f) => f.id === job.id))];

    stats.discovered = freshJobs.length;
    log.add(
      "dedupe",
      `${freshJobs.length} postings were new; ${plausible.length - freshJobs.length} had already been seen. ${toScore.length} queued for scoring.`,
    );

    /* -------------------------------- scoring -------------------------------- */

    const scored: Job[] = [];
    for (const job of toScore) {
      const match = await scoreJob(job, profile, resume);
      repo.updateJobScore(job.id, match.score, match.verdict, match.reasons, match.gaps);
      scored.push({
        ...job,
        score: match.score,
        scoreVerdict: match.verdict,
        scoreReasons: match.reasons,
        scoreGaps: match.gaps,
      });
    }

    stats.scored = scored.length;
    stats.topScore = scored.reduce((top, job) => Math.max(top, job.score ?? 0), 0);
    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    log.add(
      "score",
      scored.length > 0
        ? `Scored ${scored.length} postings. Best match: ${Math.round(stats.topScore)}/100 (${scored[0].title} at ${scored[0].company}).`
        : "No new postings needed scoring.",
    );

    /* ---------------------------- apply / prepare ---------------------------- */

    const alreadySentToday = repo.countApplicationsSince(startOfUtcDay());
    let remainingCap = Math.max(0, profile.dailyApplicationCap - alreadySentToday);
    if (alreadySentToday > 0) {
      log.add(
        "cap",
        `${alreadySentToday} application(s) already went out today, leaving ${remainingCap} of your ${profile.dailyApplicationCap} daily cap.`,
      );
    }

    for (const job of scored) {
      const score = job.score ?? 0;

      if (score < profile.autoApplyThreshold) {
        const reason =
          score >= profile.autoApplyThreshold - SHORTLIST_MARGIN
            ? `scored ${Math.round(score)}, just under your ${profile.autoApplyThreshold} threshold — shortlisted instead of applied`
            : job.scoreGaps[0]
              ? `scored ${Math.round(score)} — ${job.scoreGaps[0].toLowerCase()}`
              : `scored ${Math.round(score)}, below your ${profile.autoApplyThreshold} threshold`;

        repo.updateJobStatus(
          job.id,
          score >= profile.autoApplyThreshold - SHORTLIST_MARGIN ? "shortlisted" : "skipped",
        );
        skipped.push({ job, reason });
        stats.skipped += 1;
        continue;
      }

      const channel = channelFor(job);
      const tailored = await tailorApplication(job, profile, resume);
      const canAutoSend = profile.autopilotEnabled && channel === "email" && remainingCap > 0;

      if (!canAutoSend) {
        const application = repo.upsertApplication({
          jobId: job.id,
          status: "awaiting_review",
          channel,
          resumeMarkdown: tailored.resumeMarkdown,
          coverLetter: tailored.coverLetter,
          tailoringNotes: tailored.notes,
          runId: run.id,
          notes: reviewReason(profile.autopilotEnabled, channel, remainingCap),
        });
        repo.updateJobStatus(job.id, "queued");
        awaitingReview.push({ application, job });
        stats.awaitingReview += 1;
        continue;
      }

      const outcome = await submitByEmail(job, profile, tailored);
      if (outcome.submitted) {
        const application = repo.upsertApplication({
          jobId: job.id,
          status: "submitted",
          channel,
          resumeMarkdown: tailored.resumeMarkdown,
          coverLetter: tailored.coverLetter,
          tailoringNotes: tailored.notes,
          submittedAt: new Date().toISOString(),
          runId: run.id,
          notes: outcome.message,
        });
        repo.updateJobStatus(job.id, "applied");
        submitted.push({ application, job });
        stats.submitted += 1;
        remainingCap -= 1;
        log.add("apply", `Applied to ${job.title} at ${job.company}. ${outcome.message}`);
      } else {
        const application = repo.upsertApplication({
          jobId: job.id,
          status: "awaiting_review",
          channel,
          resumeMarkdown: tailored.resumeMarkdown,
          coverLetter: tailored.coverLetter,
          tailoringNotes: tailored.notes,
          runId: run.id,
          error: outcome.result?.error ?? null,
          notes: outcome.message,
        });
        repo.updateJobStatus(job.id, "queued");
        awaitingReview.push({ application, job });
        stats.awaitingReview += 1;
        log.add("apply", `Prepared but did not send ${job.title} at ${job.company}. ${outcome.message}`, "warn");
      }
    }

    if (!profile.autopilotEnabled && stats.awaitingReview > 0) {
      notes.push(
        `Autopilot is off, so ${stats.awaitingReview} application${stats.awaitingReview === 1 ? "" : "s"} are prepared and waiting for your approval instead of being sent.`,
      );
    }
    if (!isSmtpConfigured()) {
      notes.push(
        "SMTP is not configured, so outbound mail (applications and this digest) is written to .data/outbox and viewable in the dashboard instead of being delivered.",
      );
    }

    const externalFormCount = awaitingReview.filter((entry) => entry.application.channel === "external_form").length;
    if (externalFormCount > 0) {
      notes.push(
        `${externalFormCount} posting${externalFormCount === 1 ? "" : "s"} require submission through the company's own application form. The agent prepared the full pack but does not fill third-party forms, since scripted submission violates most boards' terms of service.`,
      );
    }

    /* ------------------------------ profile refresh --------------------------- */

    if (options.refreshLinkedIn !== false) {
      const marketJobs = repo.listJobs({ limit: 60 });
      const pack = await generateLinkedInPack(profile, resume, marketJobs);
      repo.insertLinkedInPack(pack);
      log.add(
        "profile",
        `Regenerated the LinkedIn update pack against ${marketJobs.length} tracked postings using ${pack.generatedBy}.`,
      );
    }

    /* --------------------------------- digest -------------------------------- */

    let digestId: number | null = null;
    let digestTransport: string | null = null;

    if (options.sendDigest !== false) {
      const built = buildDigest({
        profile,
        runDate: new Date().toISOString(),
        stats,
        submitted,
        awaitingReview,
        skipped,
        notes,
        appBaseUrl: options.appBaseUrl,
      });

      const delivery = await sendMail({
        to: profile.digestEmail || profile.email,
        subject: built.subject,
        html: built.html,
        text: built.text,
      });

      const digest = repo.insertDigest({
        runDate: new Date().toISOString().slice(0, 10),
        subject: built.subject,
        html: built.html,
        text: built.text,
        toEmail: profile.digestEmail || profile.email,
        status: delivery.transport === "smtp" && delivery.ok ? "sent" : delivery.ok ? "outbox" : "failed",
        transport: delivery.transport,
        sentAt: delivery.transport === "smtp" && delivery.ok ? new Date().toISOString() : null,
        error: delivery.error ?? null,
        stats,
      });

      digestId = digest.id;
      digestTransport = delivery.transport;
      log.add("digest", `Digest "${built.subject}" — ${delivery.detail}`, delivery.ok ? "info" : "error");
    }

    repo.finishRun(run.id, "success", stats, log.entries);
    return { runId: run.id, status: "success", stats, log: log.entries, digestId, digestTransport };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.add("error", message, "error");
    repo.finishRun(run.id, "failed", stats, log.entries, message);
    return {
      runId: run.id,
      status: "failed",
      stats,
      log: log.entries,
      digestId: null,
      digestTransport: null,
    };
  }
}

function reviewReason(autopilot: boolean, channel: string, remainingCap: number): string {
  if (channel === "external_form") {
    return "This company accepts applications only through its own form. The tailored resume and cover letter are ready — the final submit is yours.";
  }
  if (!autopilot) {
    return "Autopilot is off, so this application is prepared and waiting for your approval.";
  }
  if (remainingCap <= 0) {
    return "Your daily application cap was already reached, so this was prepared for tomorrow rather than sent.";
  }
  return "Prepared and waiting for review.";
}
