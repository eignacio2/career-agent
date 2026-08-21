import { ok, serverError } from "@/lib/http";
import { isLlmConfigured, llmModelLabel } from "@/lib/llm";
import { getSmtpConfig, isSmtpConfigured } from "@/lib/mail";
import { getProfile, listRuns } from "@/lib/repo";

export const runtime = "nodejs";

export interface IntegrationStatus {
  llm: { configured: boolean; label: string };
  smtp: { configured: boolean; host: string | null };
  cron: { secretSet: boolean };
  autopilot: boolean;
  lastRunAt: string | null;
}

export async function GET() {
  try {
    const smtp = getSmtpConfig();
    const [latest] = listRuns(1);

    const status: IntegrationStatus = {
      llm: { configured: isLlmConfigured(), label: llmModelLabel() },
      smtp: { configured: isSmtpConfigured(), host: smtp?.host ?? null },
      cron: { secretSet: Boolean(process.env.CRON_SECRET) },
      autopilot: getProfile().autopilotEnabled,
      lastRunAt: latest?.startedAt ?? null,
    };
    return ok(status);
  } catch (error) {
    return serverError(error);
  }
}
