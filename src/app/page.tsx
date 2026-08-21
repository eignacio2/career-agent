import { ArrowRight, Mail, Sparkles } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/app-shell";
import { ApplicationStatusBadge, ScoreBadge } from "@/components/badges";
import { RunAgentButton } from "@/components/run-agent-button";
import { SetupNotice } from "@/components/setup-notice";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isLlmConfigured } from "@/lib/llm";
import { isSmtpConfigured } from "@/lib/mail";
import {
  countApplications,
  countJobs,
  getProfile,
  listApplications,
  listDigests,
  listJobs,
  listRuns,
} from "@/lib/repo";
import { DEFAULT_PROFILE } from "@/lib/seed";

export const dynamic = "force-dynamic";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export default function DashboardPage() {
  const profile = getProfile();
  const jobCounts = countJobs();
  const applicationCounts = countApplications();
  const awaiting = listApplications({ status: ["awaiting_review"], limit: 5 });
  const recentSubmitted = listApplications({ status: ["submitted"], limit: 5 });
  const [lastRun] = listRuns(1);
  const [lastDigest] = listDigests(1);
  const topMatches = listJobs({ status: ["new", "shortlisted"], limit: 4 });

  const neverRun = !lastRun;

  return (
    <div className="pb-16">
      <PageHeader
        title="Dashboard"
        description={
          neverRun
            ? "Nothing has run yet. Start a search and the agent will pull fresh data science and AI engineering postings, score them against your background, tailor an application for each strong match, and email you a summary."
            : `Last run ${relativeTime(lastRun.startedAt)}, triggered ${lastRun.trigger === "manual" ? "by hand" : "on schedule"}.`
        }
        actions={<RunAgentButton />}
      />

      <div className="space-y-6 px-5 py-6 sm:px-8">
        <SetupNotice
          state={{
            llmConfigured: isLlmConfigured(),
            smtpConfigured: isSmtpConfigured(),
            autopilotEnabled: profile.autopilotEnabled,
            profileIsDefault: profile.fullName === DEFAULT_PROFILE.fullName,
          }}
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Applications sent"
            value={applicationCounts.submitted ?? 0}
            hint={`Cap is ${profile.dailyApplicationCap} per day`}
            accent="positive"
          />
          <StatCard
            label="Awaiting your review"
            value={applicationCounts.awaiting_review ?? 0}
            hint="Tailored and ready to send"
            accent={(applicationCounts.awaiting_review ?? 0) > 0 ? "attention" : "neutral"}
          />
          <StatCard
            label="Postings tracked"
            value={jobCounts.total}
            hint={`${jobCounts.skipped} screened out, ${jobCounts.shortlisted} shortlisted`}
          />
          <StatCard
            label="Best match so far"
            value={lastRun ? `${Math.round(lastRun.stats.topScore ?? 0)}/100` : "—"}
            hint={`Auto-apply threshold is ${profile.autoApplyThreshold}`}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border bg-card">
              <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold">Waiting on you</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Applications the agent prepared but has not sent.
                  </p>
                </div>
                {awaiting.length > 0 ? (
                  <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
                    <Link href="/applications">
                      View all <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                ) : null}
              </div>

              {awaiting.length === 0 ? (
                <EmptyState
                  title={neverRun ? "No applications yet" : "Nothing waiting"}
                  body={
                    neverRun
                      ? "Run a search to have the agent screen live postings and prepare applications for the strong matches."
                      : "Every prepared application has been handled. The next scheduled run will look for more."
                  }
                />
              ) : (
                <ul className="divide-y">
                  {awaiting.map((application) => (
                    <li key={application.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{application.job?.title}</span>
                          <ScoreBadge score={application.job?.score ?? null} />
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {application.job?.company} · {application.job?.location || "location not stated"}
                          {application.job?.salaryText ? ` · ${application.job.salaryText}` : ""}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <ApplicationStatusBadge status={application.status} />
                          <Badge variant="outline" className="text-[11px] font-normal">
                            {application.channel === "email" ? "Email application" : "Company form"}
                          </Badge>
                        </div>
                      </div>
                      <Button asChild size="sm" variant="outline" className="shrink-0">
                        <Link href={`/applications/${application.id}`}>Review</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border bg-card">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-semibold">Run log</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {lastRun
                    ? `${lastRun.log.length} steps from the ${lastRun.status === "success" ? "last successful" : "last"} run.`
                    : "Each run records what it searched, scored, and sent."}
                </p>
              </div>

              {!lastRun ? (
                <EmptyState
                  title="No runs recorded"
                  body="The log shows which boards were queried, how each posting scored, and what happened to every application."
                />
              ) : (
                <ol className="divide-y">
                  {lastRun.log.map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className="flex gap-3 px-5 py-3">
                      <span className="mt-0.5 w-16 shrink-0 font-mono text-[11px] uppercase text-muted-foreground">
                        {entry.step}
                      </span>
                      <span
                        className={
                          entry.level === "error"
                            ? "text-xs leading-relaxed text-red-600 dark:text-red-400"
                            : entry.level === "warn"
                              ? "text-xs leading-relaxed text-amber-700 dark:text-amber-400"
                              : "text-xs leading-relaxed text-foreground/80"
                        }
                      >
                        {entry.message}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-2">
                <Mail className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Today&apos;s digest</h2>
              </div>
              {lastDigest ? (
                <>
                  <p className="mt-3 text-sm leading-snug font-medium">{lastDigest.subject}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {lastDigest.status === "sent"
                      ? `Delivered to ${lastDigest.toEmail}`
                      : lastDigest.status === "outbox"
                        ? `Saved to the local outbox for ${lastDigest.toEmail}`
                        : "Delivery failed"}{" "}
                    · {relativeTime(lastDigest.createdAt)}
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                    <Link href="/digests">Open the digest</Link>
                  </Button>
                </>
              ) : (
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  After each run the agent emails {profile.digestEmail} a list of what it applied to, what is waiting
                  on you, and what it screened out and why.
                </p>
              )}
            </div>

            <div className="rounded-xl border bg-card">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-semibold">Top open matches</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Highest scoring postings not yet acted on.</p>
              </div>
              {topMatches.length === 0 ? (
                <EmptyState title="No open matches" body="New postings appear here as soon as a run finds them." />
              ) : (
                <ul className="divide-y">
                  {topMatches.map((job) => (
                    <li key={job.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm leading-snug font-medium">{job.title}</span>
                        <ScoreBadge score={job.score} />
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{job.company}</div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t px-5 py-3">
                <Button asChild variant="ghost" size="sm" className="w-full gap-1 text-xs">
                  <Link href="/jobs">
                    See all matches <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </div>

            {recentSubmitted.length > 0 ? (
              <div className="rounded-xl border bg-card">
                <div className="border-b px-5 py-4">
                  <h2 className="text-sm font-semibold">Recently sent</h2>
                </div>
                <ul className="divide-y">
                  {recentSubmitted.map((application) => (
                    <li key={application.id} className="px-5 py-3">
                      <Link href={`/applications/${application.id}`} className="block hover:underline">
                        <span className="text-sm leading-snug font-medium">{application.job?.title}</span>
                      </Link>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {application.job?.company} ·{" "}
                        {application.submittedAt ? relativeTime(application.submittedAt) : "recently"}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-xl border border-dashed bg-muted/30 p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Keep the profile current</h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Each run regenerates a LinkedIn update pack ranked against the requirements that actually show up in
                the postings it finds.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                <Link href="/linkedin">Open the LinkedIn pack</Link>
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
