"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function RegeneratePackButton({ hasPack }: { hasPack: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function regenerate() {
    setBusy(true);
    const toastId = toast.loading("Rewriting your profile against the postings the agent has found…");
    try {
      const response = await fetch("/api/linkedin", { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error("Could not regenerate the pack", { id: toastId, description: payload.error });
        return;
      }
      toast.success("LinkedIn pack updated", {
        id: toastId,
        description: "Copy each field into LinkedIn to apply it.",
      });
      router.refresh();
    } catch (error) {
      toast.error("Could not regenerate the pack", {
        id: toastId,
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={regenerate} disabled={busy} className="gap-2">
      {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      {hasPack ? "Regenerate" : "Generate the pack"}
    </Button>
  );
}
