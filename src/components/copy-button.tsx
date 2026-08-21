"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copy",
  className,
  size = "sm",
  variant = "outline",
}: {
  value: string;
  label?: string;
  className?: string;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "ghost" | "secondary" | "default";
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access is blocked outside secure contexts; fall back to a
      // hidden textarea so the button still works over plain HTTP.
      const scratch = document.createElement("textarea");
      scratch.value = value;
      scratch.style.position = "fixed";
      scratch.style.opacity = "0";
      document.body.appendChild(scratch);
      scratch.select();
      document.execCommand("copy");
      document.body.removeChild(scratch);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={copy} className={cn("gap-1.5", className)}>
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {size === "icon" ? null : copied ? "Copied" : label}
    </Button>
  );
}
