"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function ResendDigestButton({
  digestId,
  smtpConfigured,
}: {
  digestId: number;
  smtpConfigured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    const toastId = toast.loading(smtpConfigured ? "Sending…" : "Writing to the local outbox…");
    try {
      const response = await fetch(`/api/digests/${digestId}/resend`, { method: "POST" });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        toast.error("Could not send", { id: toastId, description: payload.error });
        return;
      }
      toast.success(smtpConfigured ? "Digest sent" : "Digest written to the outbox", {
        id: toastId,
        description: payload.message,
      });
      router.refresh();
    } catch (error) {
      toast.error("Could not send", {
        id: toastId,
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={resend} disabled={busy} className="gap-2">
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
      {smtpConfigured ? "Send again" : "Write to outbox"}
    </Button>
  );
}
