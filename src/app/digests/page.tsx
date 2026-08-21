import Link from "next/link";

import { PageHeader } from "@/components/app-shell";
import { CopyButton } from "@/components/copy-button";
import { ResendDigestButton } from "@/components/resend-digest-button";
import { RunAgentButton } from "@/components/run-agent-button";
import { Badge } from "@/components/ui/badge";
import { isSmtpConfigured } from "@/lib/mail";
import { getProfile, listDigests } from "@/lib/repo";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  sent: {
    label: "Delivered",
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  outbox: {
    label: "Saved to outbox",
    tone: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  failed: { label: "Failed", tone: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
};

export default async function DigestsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const digests = listDigests(30);
  const profile = getProfile();
  const smtpConfigured = isSmtpConfigured();

  const selected = id ? digests.find((digest) => digest.id === Number(id)) : digests[0];

  return (
    <div className="pb-16">
      <PageHeader
        title="Daily email"
        description={`Every run emails ${profile.digestEmail} a summary of what went out, what is waiting on you, and what got screened out. Scheduled for ${String(profile.digestHourUtc).padStart(2, "0")}:00 UTC.`}
        actions={<RunAgentButton label="Generate one now" variant="outline" />}
      />

      <div className="px-5 py-6 sm:px-8">
        {digests.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-16 text-center">
            <p className="text-sm font-medium">No digests yet</p>
            <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-muted-foreground">
              {smtpConfigured
                ? "After the first run you will get an email listing every application sent that day, with links back to the exact resume and cover letter used."
                : "SMTP is not configured yet, so digests will be written to .data/outbox and rendered here exactly as they would arrive in your inbox."}
            </p>
            <div className="mt-5 flex justify-center">
              <RunAgentButton label="Run the agent" />
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
            <nav className="space-y-2">
              {digests.map((digest) => {
                const active = selected?.id === digest.id;
                const status = STATUS_COPY[digest.status] ?? STATUS_COPY.failed;
                return (
                  <Link
                    key={digest.id}
                    href={`/digests?id=${digest.id}`}
                    className={cn(
                      "block rounded-xl border p-4 transition-colors",
                      active ? "border-primary/40 bg-accent/60" : "bg-card hover:bg-accent/30",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {new Date(digest.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span
                        className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", status.tone)}
                      >
                        {status.label}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-snug font-medium">{digest.subject}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {digest.stats.submitted} sent · {digest.stats.awaitingReview} to review ·{" "}
                      {digest.stats.discovered} screened
                    </p>
                  </Link>
                );
              })}
            </nav>

            {selected ? (
              <section className="min-w-0 rounded-xl border bg-card">
                <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{selected.subject}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      To {selected.toEmail} ·{" "}
                      {new Date(selected.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <CopyButton value={selected.text} label="Copy as text" />
                    <ResendDigestButton digestId={selected.id} smtpConfigured={smtpConfigured} />
                  </div>
                </div>

                {selected.error ? (
                  <p className="border-b bg-red-50 px-5 py-3 text-xs leading-relaxed text-red-700 dark:bg-red-950 dark:text-red-300">
                    {selected.error}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2 border-b px-5 py-3">
                  <Badge variant="secondary" className="font-normal">
                    {selected.stats.discovered} screened
                  </Badge>
                  <Badge variant="secondary" className="font-normal">
                    {selected.stats.scored} scored
                  </Badge>
                  <Badge variant="secondary" className="font-normal">
                    {selected.stats.submitted} sent
                  </Badge>
                  <Badge variant="secondary" className="font-normal">
                    {selected.stats.awaitingReview} awaiting review
                  </Badge>
                  <Badge variant="secondary" className="font-normal">
                    top match {Math.round(selected.stats.topScore)}
                  </Badge>
                </div>

                <iframe
                  title={`Digest for ${selected.runDate}`}
                  srcDoc={selected.html}
                  sandbox=""
                  className="h-[70vh] w-full rounded-b-xl bg-white"
                />
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
