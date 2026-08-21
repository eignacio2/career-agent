import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/app-shell";
import { JobActions } from "@/components/job-actions";
import { JobStatusBadge, ScoreBadge } from "@/components/badges";
import { RunAgentButton } from "@/components/run-agent-button";
import { Badge } from "@/components/ui/badge";
import { getProfile, listApplications, listJobs } from "@/lib/repo";
import type { JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string; statuses?: JobStatus[] }[] = [
  { key: "open", label: "Open", statuses: ["new", "shortlisted"] },
  { key: "queued", label: "Queued", statuses: ["queued"] },
  { key: "applied", label: "Applied", statuses: ["applied"] },
  { key: "skipped", label: "Screened out", statuses: ["skipped", "expired"] },
  { key: "all", label: "Everything" },
];

const ROLE_LABELS: Record<string, string> = {
  "data-science": "Data science",
  "ai-engineering": "AI engineering",
  adjacent: "Adjacent",
};

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "open" } = await searchParams;
  const active = FILTERS.find((entry) => entry.key === filter) ?? FILTERS[0];

  const profile = getProfile();
  const jobs = listJobs({ status: active.statuses, limit: 300 });
  const applications = listApplications({ limit: 300 });
  const applicationByJob = new Map(applications.map((application) => [application.jobId, application]));

  return (
    <div className="pb-16">
      <PageHeader
        title="Matches"
        description={`Every posting the agent has found, scored against your background. Anything at or above ${profile.autoApplyThreshold}/100 gets an application prepared automatically.`}
        actions={<RunAgentButton label="Find new postings" variant="outline" />}
      />

      <div className="px-5 py-6 sm:px-8">
        <nav className="mb-5 flex gap-1 overflow-x-auto pb-1">
          {FILTERS.map((entry) => (
            <Link
              key={entry.key}
              href={`/jobs?filter=${entry.key}`}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                entry.key === active.key
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
            </Link>
          ))}
        </nav>

        {jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-16 text-center">
            <p className="text-sm font-medium">
              {filter === "open" ? "No open matches right now" : "Nothing in this view"}
            </p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
              {filter === "open"
                ? "Run a search and the agent will pull postings from the live boards, drop anything that is not data science or AI engineering work, and score the rest against your resume."
                : "Postings land here as runs move them through the pipeline."}
            </p>
            <div className="mt-5 flex justify-center">
              <RunAgentButton label="Run a search" />
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => {
              const application = applicationByJob.get(job.id);
              return (
                <li key={job.id} className="rounded-xl border bg-card p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold leading-tight">{job.title}</h2>
                        <ScoreBadge score={job.score} />
                        <JobStatusBadge status={job.status} />
                      </div>

                      <div className="mt-1.5 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground/80">{job.company}</span>
                        {" · "}
                        {job.location || "location not stated"}
                        {job.salaryText ? ` · ${job.salaryText}` : ""}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="text-[11px] font-normal">
                          {ROLE_LABELS[job.roleFamily] ?? job.roleFamily}
                        </Badge>
                        <Badge variant="outline" className="text-[11px] font-normal">
                          {job.applyEmail ? "Accepts email applications" : "Company form"}
                        </Badge>
                        <Badge variant="outline" className="text-[11px] font-normal">
                          via {job.source}
                        </Badge>
                        {job.scoreVerdict ? (
                          <Badge variant="outline" className="text-[11px] font-normal">
                            {job.scoreVerdict}
                          </Badge>
                        ) : null}
                      </div>

                      {job.scoreReasons.length > 0 ? (
                        <ul className="mt-3.5 space-y-1">
                          {job.scoreReasons.slice(0, 3).map((reason, index) => (
                            <li
                              key={index}
                              className="relative pl-4 text-xs leading-relaxed text-foreground/75 before:absolute before:left-0 before:text-muted-foreground before:content-['—']"
                            >
                              {reason}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {job.scoreGaps.length > 0 ? (
                        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                          <span className="font-medium text-foreground/70">Gaps:</span>{" "}
                          {job.scoreGaps.slice(0, 6).join(", ")}
                        </p>
                      ) : null}

                      <a
                        href={job.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-3.5 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        View the posting <ExternalLink className="size-3" />
                      </a>
                    </div>

                    <JobActions
                      jobId={job.id}
                      status={job.status}
                      hasApplication={Boolean(application)}
                      applicationId={application?.id ?? null}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
