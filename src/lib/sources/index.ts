import type { JobRole } from "../types";
import { arbeitnowSource } from "./arbeitnow";
import { offlineSource } from "./offline";
import { remotiveSource } from "./remotive";
import type { JobSource, SourceJob } from "./types";

export type { SourceJob } from "./types";

export const LIVE_SOURCES: JobSource[] = [remotiveSource, arbeitnowSource];
export const FALLBACK_SOURCE: JobSource = offlineSource;

export interface DiscoveryResult {
  jobs: SourceJob[];
  sourcesUsed: string[];
  sourcesFailed: string[];
  usedFallback: boolean;
}

/**
 * Queries every live board, then falls back to the bundled sample board if none
 * of them returned anything (restricted egress, rate limits, or an outage).
 */
export async function discover(queries: string[], limitPerSource = 25): Promise<DiscoveryResult> {
  const jobs: SourceJob[] = [];
  const sourcesUsed: string[] = [];
  const sourcesFailed: string[] = [];

  const settled = await Promise.allSettled(
    LIVE_SOURCES.map(async (source) => ({
      source,
      results: await source.fetch(queries, limitPerSource),
    })),
  );

  for (const [index, outcome] of settled.entries()) {
    const source = LIVE_SOURCES[index];
    if (outcome.status === "fulfilled" && outcome.value.results.length > 0) {
      jobs.push(...outcome.value.results);
      sourcesUsed.push(source.label);
    } else {
      sourcesFailed.push(source.label);
    }
  }

  if (jobs.length === 0) {
    const fallback = await FALLBACK_SOURCE.fetch(queries, 25);
    return {
      jobs: dedupe(fallback),
      sourcesUsed: [FALLBACK_SOURCE.label],
      sourcesFailed,
      usedFallback: true,
    };
  }

  return { jobs: dedupe(jobs), sourcesUsed, sourcesFailed, usedFallback: false };
}

function dedupe(jobs: SourceJob[]): SourceJob[] {
  const seen = new Set<string>();
  const unique: SourceJob[] = [];
  for (const job of jobs) {
    const key = `${job.company.toLowerCase().trim()}::${job.title.toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(job);
  }
  return unique;
}

const AI_ENGINEERING_SIGNALS = [
  "ai engineer",
  "llm",
  "large language model",
  "genai",
  "generative ai",
  "rag",
  "retrieval augmented",
  "agent",
  "prompt",
  "nlp engineer",
  "machine learning engineer",
  "mlops",
  "ml platform",
  "inference",
  "fine-tun",
];

const DATA_SCIENCE_SIGNALS = [
  "data scientist",
  "applied scientist",
  "research scientist",
  "decision scientist",
  "quantitative",
  "statistician",
  "forecasting",
  "experimentation",
  "causal",
  "econometric",
];

export function classifyRole(job: Pick<SourceJob, "title" | "tags" | "description">): JobRole {
  const title = job.title.toLowerCase();
  const haystack = `${title} ${job.tags.join(" ")} ${job.description.slice(0, 1200)}`.toLowerCase();

  const titleIsAi = AI_ENGINEERING_SIGNALS.some((signal) => title.includes(signal));
  const titleIsDs = DATA_SCIENCE_SIGNALS.some((signal) => title.includes(signal));
  if (titleIsAi) return "ai-engineering";
  if (titleIsDs) return "data-science";

  const bodyIsAi = AI_ENGINEERING_SIGNALS.some((signal) => haystack.includes(signal));
  const bodyIsDs = DATA_SCIENCE_SIGNALS.some((signal) => haystack.includes(signal));
  if (bodyIsAi) return "ai-engineering";
  if (bodyIsDs) return "data-science";
  return "adjacent";
}

const OFF_TARGET_TITLES = [
  "sales",
  "account executive",
  "recruiter",
  "customer success",
  "designer",
  "copywriter",
  "teacher",
  "nurse",
  "driver",
  "warehouse",
];

/** Cheap pre-filter so the scorer never spends a model call on obviously wrong roles. */
export function isPlausibleTarget(job: SourceJob): boolean {
  const title = job.title.toLowerCase();
  if (OFF_TARGET_TITLES.some((needle) => title.includes(needle))) return false;

  const role = classifyRole(job);
  if (role !== "adjacent") return true;

  const technical = ["python", "sql", "machine learning", "analytics", "data", "model"];
  return technical.some((needle) => `${title} ${job.tags.join(" ")}`.includes(needle));
}
