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

/**
 * Classification runs on the job title only. Body text is far too noisy: a
 * customer-support posting says "agent" and "prompt", and a Rails posting
 * mentions "inference" in passing, so matching on the description alone drags in
 * roles that have nothing to do with this search.
 */
const AI_ENGINEERING_TITLES = [
  /\ba\.?i\.?\s*[/&-]?\s*(engineer|developer|architect|scientist)\b/,
  /\b(ml|machine[\s-]learning)\s*[/&-]?\s*(engineer|scientist|architect|researcher)\b/,
  /\bllm\s*[/&-]?\s*(engineer|developer|scientist|architect)\b/,
  /\b(gen\s?ai|generative\s+ai)\b/,
  /\bmlops\b/,
  /\bml\s+(platform|infrastructure|ops)\b/,
  /\bnlp\s+(engineer|scientist)\b/,
  /\bcomputer\s+vision\s+(engineer|scientist)\b/,
  /\bdeep\s+learning\b/,
  /\bprompt\s+engineer\b/,
  /\bresearch\s+engineer\b/,
  /\b(software|backend|platform)\s+engineer\b.*\b(ml|ai|machine\s+learning|inference|model)\b/,
];

const DATA_SCIENCE_TITLES = [
  /\bdata\s+scien(ce|tist)\b/,
  /\b(applied|research|decision|staff|principal|lead|senior)\s+scientist\b/,
  /\bstatistician\b/,
  /\b(quantitative|quant)\s+(analyst|researcher|developer|scientist)\b/,
  /\beconometric/,
  /\bexperimentation\s+(scientist|analyst)\b/,
];

const ADJACENT_TITLES = [
  /\bdata\s+engineer\b/,
  /\banalytics\s+engineer\b/,
  /\bdata\s+analyst\b/,
  /\bdata\s+architect\b/,
  /\bbusiness\s+intelligence\b/,
  /\banalytics\s+(lead|manager)\b/,
];

/** Never worth a scoring pass regardless of what the rest of the title says. */
const HARD_REJECT_TITLES = [
  /\b(sales|account\s+executive|business\s+development|recruit(er|ing)|customer\s+(success|support)|support\s+(specialist|engineer|agent)|office\s+(assistant|manager)|executive\s+assistant)\b/,
  /\b(designer|copywriter|content\s+writer|social\s+media|marketing\s+(manager|specialist))\b/,
  /\b(teacher|tutor|nurse|driver|warehouse|technician|labeling|annotator|annotation)\b/,
  /\b(intern|internship)\b/,
];

function matchTitle(title: string): JobRole | null {
  const normalized = title.toLowerCase();
  if (HARD_REJECT_TITLES.some((pattern) => pattern.test(normalized))) return null;
  if (AI_ENGINEERING_TITLES.some((pattern) => pattern.test(normalized))) return "ai-engineering";
  if (DATA_SCIENCE_TITLES.some((pattern) => pattern.test(normalized))) return "data-science";
  if (ADJACENT_TITLES.some((pattern) => pattern.test(normalized))) return "adjacent";
  return null;
}

export function classifyRole(job: Pick<SourceJob, "title" | "tags" | "description">): JobRole {
  return matchTitle(job.title) ?? "adjacent";
}

/**
 * Pre-filter run before scoring. Boards return loose keyword matches, so an
 * allowlist on the title is the only reliable way to keep the pipeline focused
 * on data science and AI engineering work.
 */
export function isPlausibleTarget(job: SourceJob): boolean {
  return matchTitle(job.title) !== null;
}
