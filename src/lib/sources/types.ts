export interface SourceJob {
  source: string;
  sourceId: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  url: string;
  /** Set when the posting accepts applications by email, which the agent can send unattended. */
  applyEmail: string | null;
  description: string;
  salaryText: string | null;
  tags: string[];
  postedAt: string | null;
}

export interface JobSource {
  id: string;
  label: string;
  requiresNetwork: boolean;
  fetch(queries: string[], limit: number): Promise<SourceJob[]>;
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&hellip;": "…",
};

export function stripHtml(input: string, maxLength = 6000): string {
  const text = input
    .replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&[a-z#0-9]+;/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? " ")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/** Pulls an application address out of a posting body when one is advertised. */
export function findApplyEmail(text: string): string | null {
  const applyContext = text.match(
    /(apply|send|email|resume|cv|submit|contact)[^\n]{0,120}?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
  );
  const candidate = applyContext?.[2] ?? text.match(EMAIL_PATTERN)?.[0];
  if (!candidate) return null;

  const lowered = candidate.toLowerCase();
  const noReply = ["no-reply", "noreply", "donotreply", "example.com", "sentry.io"];
  if (noReply.some((needle) => lowered.includes(needle))) return null;
  return lowered;
}

export async function fetchJson<T>(url: string, timeoutMs = 12_000): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "career-agent/1.0 (personal job-search assistant)",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
