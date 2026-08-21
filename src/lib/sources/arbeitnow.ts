import { fetchJson, findApplyEmail, stripHtml, type JobSource, type SourceJob } from "./types";

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number;
}

export const arbeitnowSource: JobSource = {
  id: "arbeitnow",
  label: "Arbeitnow",
  requiresNetwork: true,

  async fetch(queries, limit) {
    const payload = await fetchJson<{ data?: ArbeitnowJob[] }>(
      "https://www.arbeitnow.com/api/job-board-api",
    );
    if (!payload?.data) return [];

    const needles = queries.map((query) => query.toLowerCase());
    const matches: SourceJob[] = [];

    for (const job of payload.data) {
      const haystack = `${job.title} ${job.tags?.join(" ") ?? ""}`.toLowerCase();
      if (!needles.some((needle) => haystack.includes(needle) || partialMatch(haystack, needle))) {
        continue;
      }

      const description = stripHtml(job.description ?? "");
      matches.push({
        source: "arbeitnow",
        sourceId: job.slug,
        title: job.title,
        company: job.company_name,
        location: job.location || (job.remote ? "Remote" : ""),
        remote: Boolean(job.remote),
        url: job.url,
        applyEmail: findApplyEmail(description),
        description,
        salaryText: null,
        tags: Array.isArray(job.tags) ? job.tags.slice(0, 12) : [],
        postedAt: job.created_at ? new Date(job.created_at * 1000).toISOString() : null,
      });

      if (matches.length >= limit) break;
    }

    return matches;
  },
};

/** Treats a multi-word query as matched when every significant word appears. */
function partialMatch(haystack: string, needle: string): boolean {
  const words = needle.split(/\s+/).filter((word) => word.length > 3);
  return words.length > 1 && words.every((word) => haystack.includes(word));
}
