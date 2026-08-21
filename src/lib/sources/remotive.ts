import { fetchJson, findApplyEmail, stripHtml, type JobSource, type SourceJob } from "./types";

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
}

export const remotiveSource: JobSource = {
  id: "remotive",
  label: "Remotive",
  requiresNetwork: true,

  async fetch(queries, limit) {
    const perQuery = Math.max(4, Math.ceil(limit / Math.max(queries.length, 1)));
    const collected = new Map<string, SourceJob>();

    for (const query of queries) {
      const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=${perQuery}`;
      const payload = await fetchJson<{ jobs?: RemotiveJob[] }>(url);
      if (!payload?.jobs) continue;

      for (const job of payload.jobs) {
        const description = stripHtml(job.description ?? "");
        collected.set(String(job.id), {
          source: "remotive",
          sourceId: String(job.id),
          title: job.title,
          company: job.company_name,
          location: job.candidate_required_location || "Remote",
          remote: true,
          url: job.url,
          applyEmail: findApplyEmail(description),
          description,
          salaryText: job.salary?.trim() ? job.salary.trim() : null,
          tags: Array.isArray(job.tags) ? job.tags.slice(0, 12) : [],
          postedAt: job.publication_date ?? null,
        });
      }
    }

    return [...collected.values()].slice(0, limit);
  },
};
