import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "positive" | "attention" | "neutral";
}) {
  const valueTone =
    accent === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "attention"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums", valueTone)}>{value}</div>
      {hint ? <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
