"use client";

import { Check, Loader2, SendHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ApplicationChannel, ApplicationStatus } from "@/lib/types";

const TRACKABLE: { value: ApplicationStatus; label: string }[] = [
  { value: "awaiting_review", label: "Awaiting review" },
  { value: "submitted", label: "Submitted" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

export function ApplicationActions({
  applicationId,
  status,
  channel,
  smtpConfigured,
}: {
  applicationId: number;
  status: ApplicationStatus;
  channel: ApplicationChannel;
  smtpConfigured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>, success: string) {
    setBusy("patch");
    try {
      const response = await fetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error("Could not update", { description: payload.error });
        return;
      }
      toast.success(success);
      router.refresh();
    } catch (error) {
      toast.error("Could not update", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    const toastId = toast.loading("Sending the application…");
    try {
      const response = await fetch(`/api/applications/${applicationId}/send`, { method: "POST" });
      const payload = (await response.json()) as { error?: string; sent?: boolean; message?: string };

      if (!response.ok) {
        toast.error("Not sent", { id: toastId, description: payload.error });
        return;
      }
      if (payload.sent) {
        toast.success("Application sent", { id: toastId, description: payload.message });
      } else {
        toast.warning("Prepared but not delivered", { id: toastId, description: payload.message });
      }
      router.refresh();
    } catch (error) {
      toast.error("Not sent", {
        id: toastId,
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
    }
  }

  const canSend = channel === "email" && status !== "submitted";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSend ? (
        <Button onClick={send} disabled={busy !== null} className="gap-2">
          {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
          {smtpConfigured ? "Approve and send" : "Approve and write to outbox"}
        </Button>
      ) : null}

      {status !== "submitted" ? (
        <Button
          variant="outline"
          onClick={() => patch({ status: "submitted" }, "Marked as submitted")}
          disabled={busy !== null}
          className="gap-2"
        >
          <Check className="size-4" />
          I submitted this myself
        </Button>
      ) : null}

      {status !== "withdrawn" ? (
        <Button
          variant="ghost"
          onClick={() => patch({ status: "withdrawn" }, "Withdrawn")}
          disabled={busy !== null}
          className="gap-2 text-muted-foreground"
        >
          <X className="size-4" />
          Withdraw
        </Button>
      ) : null}

      <Select value={status} onValueChange={(value) => patch({ status: value }, "Status updated")}>
        <SelectTrigger className="w-[170px]" size="sm" aria-label="Application status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TRACKABLE.map((entry) => (
            <SelectItem key={entry.value} value={entry.value}>
              {entry.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
