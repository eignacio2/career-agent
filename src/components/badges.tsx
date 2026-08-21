import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ApplicationStatus, JobStatus } from "@/lib/types";

export function ScoreBadge({ score, className }: { score: number | null; className?: string }) {
  if (score === null) {
    return (
      <Badge variant="outline" className={cn("font-mono text-[11px] text-muted-foreground", className)}>
        unscored
      </Badge>
    );
  }

  const rounded = Math.round(score);
  const tone =
    rounded >= 80
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
      : rounded >= 65
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
        : "border-border bg-muted text-muted-foreground";

  return (
    <Badge variant="outline" className={cn("font-mono text-[11px] tabular-nums", tone, className)}>
      {rounded}
    </Badge>
  );
}

const APPLICATION_LABELS: Record<ApplicationStatus, { label: string; tone: string }> = {
  prepared: { label: "Prepared", tone: "bg-muted text-muted-foreground" },
  awaiting_review: {
    label: "Awaiting review",
    tone: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  submitted: {
    label: "Submitted",
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  needs_manual_submit: {
    label: "Needs manual submit",
    tone: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  },
  failed: { label: "Failed", tone: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
  interviewing: {
    label: "Interviewing",
    tone: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  rejected: { label: "Rejected", tone: "bg-muted text-muted-foreground" },
  offer: {
    label: "Offer",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  },
  withdrawn: { label: "Withdrawn", tone: "bg-muted text-muted-foreground" },
};

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const entry = APPLICATION_LABELS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        entry.tone,
      )}
    >
      {entry.label}
    </span>
  );
}

const JOB_LABELS: Record<JobStatus, string> = {
  new: "New",
  shortlisted: "Shortlisted",
  queued: "Queued",
  applied: "Applied",
  skipped: "Skipped",
  expired: "Expired",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const tone =
    status === "applied"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      : status === "queued"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
        : status === "shortlisted"
          ? "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
          : "bg-muted text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        tone,
      )}
    >
      {JOB_LABELS[status]}
    </span>
  );
}
