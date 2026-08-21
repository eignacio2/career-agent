import Link from "next/link";

import { PageHeader } from "@/components/app-shell";
import { ApplicationStatusBadge, ScoreBadge } from "@/components/badges";
import { RunAgentButton } from "@/components/run-agent-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { countApplications, listApplications } from "@/lib/repo";
import type { ApplicationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string; statuses?: ApplicationStatus[] }[] = [
  { key: "review", label: "Awaiting review", statuses: ["awaiting_review", "prepared", "needs_manual_submit"] },
  { key: "sent", label: "Sent", statuses: ["submitted"] },
  { key: "progress", label: "In progress", statuses: ["interviewing", "offer"] },
  { key: "closed", label: "Closed", statuses: ["rejected", "withdrawn", "failed"] },
  { key: "all", label: "Everything" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "review" } = await searchParams;
  const active = FILTERS.find((entry) => entry.key === filter) ?? FILTERS[0];

  const applications = listApplications({ status: active.statuses, limit: 300 });
  const counts = countApplications();

  return (
    <div className="pb-16">
      <PageHeader
        title="Applications"
        description="Every application the agent has prepared or sent, with the exact resume and cover letter that went out. Nothing is submitted without either your approval or autopilot explicitly turned on."
        actions={<RunAgentButton label="Run a search" variant="outline" />}
      />

      <div className="px-5 py-6 sm:px-8">
        <nav className="mb-5 flex gap-1 overflow-x-auto pb-1">
          {FILTERS.map((entry) => {
            const count = entry.statuses
              ? entry.statuses.reduce((total, status) => total + (counts[status] ?? 0), 0)
              : counts.total;
            return (
              <Link
                key={entry.key}
                href={`/applications?filter=${entry.key}`}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                  entry.key === active.key
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {entry.label}
                <span className={cn("tabular-nums", entry.key === active.key ? "opacity-80" : "opacity-60")}>
                  {count}
                </span>
              </Link>
            );
          })}
        </nav>

        {applications.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-16 text-center">
            <p className="text-sm font-medium">Nothing here yet</p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
              When a posting clears your match threshold, the agent tailors your resume and writes a cover letter for
              it. Those applications show up here for review before anything is sent.
            </p>
            <div className="mt-5 flex justify-center">
              <RunAgentButton label="Run a search" />
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {applications.map((application) => (
              <li key={application.id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/applications/${application.id}`}
                        className="text-base font-semibold leading-tight hover:underline"
                      >
                        {application.job?.title ?? "Posting removed"}
                      </Link>
                      <ScoreBadge score={application.job?.score ?? null} />
                      <ApplicationStatusBadge status={application.status} />
                    </div>

                    <div className="mt-1.5 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground/80">{application.job?.company}</span>
                      {application.job?.location ? ` · ${application.job.location}` : ""}
                      {application.job?.salaryText ? ` · ${application.job.salaryText}` : ""}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[11px] font-normal">
                        {application.channel === "email"
                          ? `Email to ${application.job?.applyEmail ?? "the posting address"}`
                          : "Company application form"}
                      </Badge>
                      <Badge variant="outline" className="text-[11px] font-normal">
                        {application.submittedAt
                          ? `Sent ${formatDate(application.submittedAt)}`
                          : `Prepared ${formatDate(application.createdAt)}`}
                      </Badge>
                    </div>

                    {application.notes ? (
                      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{application.notes}</p>
                    ) : null}
                  </div>

                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link href={`/applications/${application.id}`}>
                      {application.status === "submitted" ? "See what was sent" : "Review"}
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
