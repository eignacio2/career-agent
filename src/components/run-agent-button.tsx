"use client";

import { Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface RunResponse {
  status: "success" | "failed";
  stats?: { discovered: number; submitted: number; awaitingReview: number; skipped: number };
  digestTransport?: string | null;
  error?: string;
}

export function RunAgentButton({
  label = "Run today's search",
  variant = "default",
  size = "default",
}: {
  label?: string;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm" | "lg";
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [, startTransition] = useTransition();

  async function run() {
    setRunning(true);
    const toastId = toast.loading("Searching boards, scoring matches, and tailoring applications…", {
      description: "This can take a minute when a language model is configured.",
    });

    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "manual" }),
      });
      const payload = (await response.json()) as RunResponse;

      if (!response.ok || payload.status === "failed") {
        toast.error("The run did not finish", {
          id: toastId,
          description: payload.error ?? "Check the run log on the dashboard for details.",
        });
        return;
      }

      const stats = payload.stats;
      toast.success(
        stats
          ? `Screened ${stats.discovered} new posting${stats.discovered === 1 ? "" : "s"} · ${stats.submitted} sent · ${stats.awaitingReview} awaiting review`
          : "Run finished",
        {
          id: toastId,
          description:
            payload.digestTransport === "outbox"
              ? "SMTP is not configured, so today's digest was saved to the local outbox."
              : "Today's digest has been emailed.",
        },
      );
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error("The run could not be started", {
        id: toastId,
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button onClick={run} disabled={running} variant={variant} size={size} className="gap-2">
      {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
      {running ? "Running…" : label}
    </Button>
  );
}
