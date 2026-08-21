import { ArrowRight, Info } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { CopyButton } from "@/components/copy-button";
import { LinkedInImport } from "@/components/linkedin-import";
import { RegeneratePackButton } from "@/components/regenerate-pack-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { getLatestLinkedInPack, getLinkedInSnapshot, getProfile } from "@/lib/repo";
import type { LinkedInChange } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SEVERITY: Record<LinkedInChange["severity"], { label: string; tone: string; ring: string }> = {
  critical: {
    label: "Fix first",
    tone: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    ring: "border-red-200 dark:border-red-900",
  },
  recommended: {
    label: "Worth doing",
    tone: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    ring: "border-amber-200 dark:border-amber-900",
  },
  polish: {
    label: "Polish",
    tone: "bg-muted text-muted-foreground",
    ring: "border-border",
  },
};

function ChangeCard({ change }: { change: LinkedInChange }) {
  const severity = SEVERITY[change.severity];

  return (
    <li className={cn("rounded-xl border bg-card p-5", severity.ring)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", severity.tone)}>
          {severity.label}
        </span>
        <h3 className="text-sm font-semibold">{change.field}</h3>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            What it says now
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-through decoration-muted-foreground/40">
            {change.current}
          </p>
        </div>

        <ArrowRight className="hidden size-4 shrink-0 self-center text-muted-foreground lg:block" />

        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-emerald-800 dark:text-emerald-300">
              Change it to
            </div>
            <CopyButton value={change.proposed} size="icon" variant="ghost" />
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-foreground">{change.proposed}</p>
        </div>
      </div>

      <p className="mt-3.5 text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground/70">Why:</span> {change.why}
      </p>
    </li>
  );
}

export default function LinkedInPage() {
  const pack = getLatestLinkedInPack();
  const profile = getProfile();
  const stored = getLinkedInSnapshot();
  const changes = pack?.changes ?? [];

  return (
    <div className="pb-16">
      <PageHeader
        title="LinkedIn update pack"
        description="Rewritten profile copy, ranked against the requirements that actually appear in the postings the agent is finding. Upload your current profile and it will tell you exactly which fields to change and why."
        actions={
          <>
            <LinkedInImport hasSnapshot={Boolean(stored)} />
            <RegeneratePackButton hasPack={Boolean(pack)} />
          </>
        }
      />

      <div className="space-y-6 px-5 py-6 sm:px-8">
        <Alert>
          <Info className="size-4" />
          <AlertTitle>Why this is copy-and-paste rather than automatic</AlertTitle>
          <AlertDescription>
            LinkedIn does not expose profile writes to third-party applications without partner API access, and
            scripting the web UI with your credentials is a terms-of-service violation that gets accounts restricted.
            So the agent does the writing and you do the pasting — about two minutes of work, with no risk to your
            account.
          </AlertDescription>
        </Alert>

        {changes.length > 0 ? (
          <section>
            <div className="mb-3">
              <h2 className="text-sm font-semibold">
                {changes.length} change{changes.length === 1 ? "" : "s"} to make on your profile
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Compared against the profile you uploaded
                {stored
                  ? ` on ${new Date(stored.capturedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                  : ""}
                . Ordered by how much each one costs you.
              </p>
            </div>
            <ul className="space-y-3">
              {changes.map((change, index) => (
                <ChangeCard key={`${change.field}-${index}`} change={change} />
              ))}
            </ul>
          </section>
        ) : stored ? (
          <Alert>
            <Info className="size-4" />
            <AlertTitle>No problems found against your uploaded profile</AlertTitle>
            <AlertDescription>
              Your headline, About section, and top skills already line up with the roles you are targeting. The
              rewritten copy below is still available if you want to compare.
            </AlertDescription>
          </Alert>
        ) : null}

        {!pack ? (
          <div className="rounded-xl border border-dashed px-6 py-16 text-center">
            <p className="text-sm font-medium">No pack generated yet</p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
              Generate one and the agent will rewrite your headline, About section, skills order, and experience
              bullets using only what is already in your resume — reordered and rephrased for recruiter search.
            </p>
            <div className="mt-5 flex justify-center">
              <RegeneratePackButton hasPack={false} />
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="font-normal">
                Generated by {pack.generatedBy}
              </Badge>
              <span>
                {new Date(pack.createdAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-4">
                <Panel
                  title="Headline"
                  hint={`${pack.headline.length} of 220 characters used. Paste into the field under your name.`}
                  copyValue={pack.headline}
                >
                  <p className="text-sm leading-relaxed">{pack.headline}</p>
                </Panel>

                <Panel
                  title="About"
                  hint="Replaces your About section. LinkedIn truncates after roughly three lines, so the first sentence carries the weight."
                  copyValue={pack.about}
                >
                  <div className="space-y-2.5">
                    {pack.about.split("\n").map((line, index) =>
                      line.trim() === "" ? null : (
                        <p key={index} className="text-sm leading-relaxed text-foreground/90">
                          {line}
                        </p>
                      ),
                    )}
                  </div>
                </Panel>

                <Panel
                  title="Skills, in this order"
                  hint="LinkedIn weights your top three skills most heavily in recruiter search. Pin the first three."
                  copyValue={pack.skills.join("\n")}
                >
                  <ol className="flex flex-wrap gap-1.5">
                    {pack.skills.map((skill, index) => (
                      <li key={skill}>
                        <Badge variant={index < 3 ? "default" : "secondary"} className="font-normal">
                          {index + 1}. {skill}
                        </Badge>
                      </li>
                    ))}
                  </ol>
                </Panel>

                {pack.experienceRewrites.map((entry) => (
                  <Panel
                    key={`${entry.company}-${entry.role}`}
                    title={`${entry.role} — ${entry.company}`}
                    hint="Paste into the description field for this role."
                    copyValue={entry.bullets.map((bullet) => `• ${bullet}`).join("\n")}
                  >
                    <ul className="space-y-2">
                      {entry.bullets.map((bullet, index) => (
                        <li
                          key={index}
                          className="relative pl-4 text-sm leading-relaxed text-foreground/90 before:absolute before:left-0 before:text-muted-foreground before:content-['•']"
                        >
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  </Panel>
                ))}
              </div>

              <aside className="space-y-4">
                <Panel
                  title="Open to work"
                  hint="Paste into the Open to work banner, or into your headline if you would rather not use the badge."
                  copyValue={pack.openToWork}
                >
                  <p className="text-sm leading-relaxed">{pack.openToWork}</p>
                </Panel>

                <div className="rounded-xl border bg-card p-5">
                  <h2 className="text-sm font-semibold">Why these edits</h2>
                  <ul className="mt-3 space-y-2.5">
                    {pack.rationale.map((item, index) => (
                      <li
                        key={index}
                        className="relative pl-4 text-xs leading-relaxed text-foreground/80 before:absolute before:left-0 before:text-muted-foreground before:content-['—']"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-dashed bg-muted/30 p-5">
                  <h2 className="text-sm font-semibold">Your profile URL</h2>
                  <p className="mt-2 text-xs leading-relaxed break-all text-muted-foreground">
                    {profile.linkedinUrl || "Add your LinkedIn URL in Settings so cover letters can reference it."}
                  </p>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Panel({
  title,
  hint,
  copyValue,
  children,
}: {
  title: string;
  hint: string;
  copyValue: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
        </div>
        <CopyButton value={copyValue} className="shrink-0" />
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
