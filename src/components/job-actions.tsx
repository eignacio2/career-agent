"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { JobStatus } from "@/lib/types";

export function JobActions({
  jobId,
  status,
  hasApplication,
  applicationId,
}: {
  jobId: number;
  status: JobStatus;
  hasApplication: boolean;
  applicationId: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"prepare" | "skip" | null>(null);

  async function call(action: "prepare" | "skip") {
    setBusy(action);
    const toastId =
      action === "prepare"
        ? toast.loading("Tailoring a resume and cover letter for this posting…")
        : undefined;

    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "prepare" ? { prepare: true } : { status: "skipped" as JobStatus }),
      });
      const payload = (await response.json()) as { error?: string; application?: { id: number } };

      if (!response.ok) {
        toast.error("That did not work", { id: toastId, description: payload.error });
        return;
      }

      if (action === "prepare" && payload.application) {
        toast.success("Application prepared", {
          id: toastId,
          description: "Review the tailored resume and cover letter before sending.",
        });
        router.push(`/applications/${payload.application.id}`);
        return;
      }

      toast.success("Removed from your list");
      router.refresh();
    } catch (error) {
      toast.error("That did not work", {
        id: toastId,
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
    }
  }

  if (hasApplication && applicationId) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => router.push(`/applications/${applicationId}`)}
        className="shrink-0"
      >
        Open application
      </Button>
    );
  }

  return (
    <div className="flex shrink-0 gap-2">
      <Button size="sm" onClick={() => call("prepare")} disabled={busy !== null} className="gap-1.5">
        {busy === "prepare" ? <Loader2 className="size-3.5 animate-spin" /> : null}
        Prepare application
      </Button>
      {status !== "skipped" ? (
        <Button size="sm" variant="ghost" onClick={() => call("skip")} disabled={busy !== null}>
          Skip
        </Button>
      ) : null}
    </div>
  );
}
