import { CheckCircle2, CircleDashed } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { SettingsForm } from "@/components/settings-form";
import { isLlmConfigured, llmModelLabel } from "@/lib/llm";
import { getSmtpConfig, isSmtpConfigured } from "@/lib/mail";
import { getProfile } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const profile = getProfile();
  const smtp = getSmtpConfig();

  const integrations = [
    {
      name: "Language model",
      configured: isLlmConfigured(),
      detail: isLlmConfigured()
        ? `Using ${llmModelLabel()} for match scoring, resume tailoring, and cover letters.`
        : "Set OPENAI_API_KEY (and optionally OPENAI_BASE_URL and OPENAI_MODEL) to replace the keyword heuristics with real reasoning.",
      env: "OPENAI_API_KEY",
    },
    {
      name: "Outbound email",
      configured: isSmtpConfigured(),
      detail: smtp
        ? `Sending through ${smtp.host}:${smtp.port} as ${smtp.from}.`
        : "Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and MAIL_FROM to deliver applications and digests. Without them, mail is written to .data/outbox.",
      env: "SMTP_HOST",
    },
    {
      name: "Scheduler token",
      configured: Boolean(process.env.CRON_SECRET),
      detail: process.env.CRON_SECRET
        ? "The /api/cron/daily route requires the bearer token from CRON_SECRET."
        : "Set CRON_SECRET to require a token on /api/cron/daily. Fine to leave unset while running only on your own machine.",
      env: "CRON_SECRET",
    },
  ];

  return (
    <div className="pb-16">
      <PageHeader
        title="Settings"
        description="Who you are, what you want, and how much the agent is allowed to do on its own. Every value here feeds directly into scoring and tailoring."
      />

      <div className="space-y-6 px-5 py-6 sm:px-8">
        <div className="grid gap-3 sm:grid-cols-3">
          {integrations.map((integration) => (
            <div key={integration.name} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                {integration.configured ? (
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <CircleDashed className="size-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">{integration.name}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{integration.detail}</p>
              <code className="mt-2.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {integration.env}
              </code>
            </div>
          ))}
        </div>

        <SettingsForm initial={profile} />
      </div>
    </div>
  );
}
