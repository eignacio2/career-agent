import { AlertTriangle, Info } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export interface SetupState {
  llmConfigured: boolean;
  smtpConfigured: boolean;
  autopilotEnabled: boolean;
  profileIsDefault: boolean;
}

/**
 * Explains which capabilities are degraded and what to do about it. Everything
 * still runs without these; the notice exists so results are never surprising.
 */
export function SetupNotice({ state }: { state: SetupState }) {
  const gaps: { title: string; body: React.ReactNode }[] = [];

  if (state.profileIsDefault) {
    gaps.push({
      title: "The profile is still the bundled example",
      body: (
        <>
          Scores and tailored resumes are being generated against placeholder experience. Replace it in{" "}
          <Link href="/settings" className="font-medium underline underline-offset-2">
            Settings
          </Link>{" "}
          and{" "}
          <Link href="/resume" className="font-medium underline underline-offset-2">
            Resume
          </Link>{" "}
          before you trust any of the output.
        </>
      ),
    });
  }

  if (!state.llmConfigured) {
    gaps.push({
      title: "No language model configured",
      body: (
        <>
          Matching and tailoring are running on the built-in keyword heuristics, which are decent at filtering and
          weak at prose. Set <code className="rounded bg-muted px-1 py-0.5 text-[11px]">OPENAI_API_KEY</code> in{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">.env.local</code> for real tailoring.
        </>
      ),
    });
  }

  if (!state.smtpConfigured) {
    gaps.push({
      title: "No mail transport configured",
      body: (
        <>
          Applications and daily digests are written to{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">.data/outbox</code> and shown under{" "}
          <Link href="/digests" className="font-medium underline underline-offset-2">
            Daily email
          </Link>{" "}
          instead of being delivered. Set the <code className="rounded bg-muted px-1 py-0.5 text-[11px]">SMTP_*</code>{" "}
          variables to send for real.
        </>
      ),
    });
  }

  if (gaps.length === 0) {
    return (
      <Alert>
        <Info className="size-4" />
        <AlertTitle>Fully configured</AlertTitle>
        <AlertDescription>
          A language model and mail transport are both connected.{" "}
          {state.autopilotEnabled
            ? "Autopilot is on, so email applications above your threshold go out without asking."
            : "Autopilot is off, so applications wait for your approval before anything is sent."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <AlertTriangle className="size-4" />
      <AlertTitle>
        {gaps.length === 1 ? "One thing to know before you trust the output" : `${gaps.length} things to know before you trust the output`}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-1 space-y-2">
          {gaps.map((gap) => (
            <li key={gap.title}>
              <span className="font-medium text-foreground">{gap.title}.</span>{" "}
              <span className="text-muted-foreground">{gap.body}</span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
