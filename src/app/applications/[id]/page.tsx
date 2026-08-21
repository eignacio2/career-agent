import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplicationActions } from "@/components/application-actions";
import { ApplicationStatusBadge, ScoreBadge } from "@/components/badges";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isSmtpConfigured } from "@/lib/mail";
import { renderMiniMarkdown } from "@/lib/mini-markdown";
import { getApplication } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const application = getApplication(Number(id));
  if (!application) notFound();

  const job = application.job;
  const resumeHtml = renderMiniMarkdown(application.resumeMarkdown);

  return (
    <div className="pb-16">
      <div className="border-b px-5 py-6 sm:px-8">
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2 gap-1.5 text-xs text-muted-foreground">
          <Link href="/applications">
            <ArrowLeft className="size-3.5" />
            All applications
          </Link>
        </Button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{job?.title ?? "Posting removed"}</h1>
              <ScoreBadge score={job?.score ?? null} />
              <ApplicationStatusBadge status={application.status} />
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground/80">{job?.company}</span>
              {job?.location ? ` · ${job.location}` : ""}
              {job?.salaryText ? ` · ${job.salaryText}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[11px] font-normal">
                {application.channel === "email"
                  ? `Email application to ${job?.applyEmail}`
                  : "Submitted through the company's form"}
              </Badge>
              {job ? (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  View the posting <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <ApplicationActions
            applicationId={application.id}
            status={application.status}
            channel={application.channel}
            smtpConfigured={isSmtpConfigured()}
          />
        </div>

        {application.notes ? (
          <p className="mt-4 max-w-3xl rounded-lg bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            {application.notes}
          </p>
        ) : null}
        {application.error ? (
          <p className="mt-3 max-w-3xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {application.error}
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 px-5 py-6 sm:px-8 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-card">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">Cover letter</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Written for this posting from your actual history.
                </p>
              </div>
              <CopyButton value={application.coverLetter} label="Copy letter" />
            </div>
            <div className="space-y-3 px-5 py-5">
              {application.coverLetter.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index} className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-card">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">Tailored resume</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Reordered and trimmed for this posting. Your master resume is untouched.
                </p>
              </div>
              <CopyButton value={application.resumeMarkdown} label="Copy Markdown" />
            </div>
            <div
              className="px-5 py-5 [&_h1]:mb-1 [&_h2]:mt-6"
              dangerouslySetInnerHTML={{ __html: resumeHtml }}
            />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold">What the agent changed</h2>
            <ul className="mt-3 space-y-2.5">
              {application.tailoringNotes.length === 0 ? (
                <li className="text-xs leading-relaxed text-muted-foreground">
                  No tailoring notes were recorded for this application.
                </li>
              ) : (
                application.tailoringNotes.map((note, index) => (
                  <li
                    key={index}
                    className="relative pl-4 text-xs leading-relaxed text-foreground/80 before:absolute before:left-0 before:text-muted-foreground before:content-['—']"
                  >
                    {note}
                  </li>
                ))
              )}
            </ul>
          </section>

          {job && job.scoreReasons.length > 0 ? (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold">Why it scored {Math.round(job.score ?? 0)}</h2>
              {job.scoreVerdict ? (
                <p className="mt-1 text-xs text-muted-foreground">{job.scoreVerdict}</p>
              ) : null}
              <ul className="mt-3 space-y-2.5">
                {job.scoreReasons.map((reason, index) => (
                  <li
                    key={index}
                    className="relative pl-4 text-xs leading-relaxed text-foreground/80 before:absolute before:left-0 before:text-muted-foreground before:content-['—']"
                  >
                    {reason}
                  </li>
                ))}
              </ul>
              {job.scoreGaps.length > 0 ? (
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground/70">Gaps to expect questions about:</span>{" "}
                  {job.scoreGaps.join(", ")}
                </p>
              ) : null}
            </section>
          ) : null}

          {job ? (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold">The posting</h2>
              <p className="mt-3 max-h-96 overflow-y-auto text-xs leading-relaxed whitespace-pre-line text-muted-foreground">
                {job.description}
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
