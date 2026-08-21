const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 45_000;

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function getLlmConfig(): LlmConfig | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
  };
}

export function isLlmConfigured(): boolean {
  return getLlmConfig() !== null;
}

export function llmModelLabel(): string {
  const config = getLlmConfig();
  return config ? config.model : "heuristic engine";
}

interface ChatOptions {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

async function chat(options: ChatOptions): Promise<string | null> {
  const config = getLlmConfig();
  if (!config) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 1600,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`LLM request failed (${response.status}): ${detail.slice(0, 300)}`);
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return payload.choices?.[0]?.message?.content?.trim() ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function chatText(options: Omit<ChatOptions, "json">): Promise<string | null> {
  try {
    return await chat(options);
  } catch {
    return null;
  }
}

/**
 * Asks the model for a JSON object. Returns null on any transport, parse, or
 * validation failure so every caller can fall back to its heuristic path.
 */
export async function chatJson<T>(
  options: Omit<ChatOptions, "json">,
  validate: (value: unknown) => T | null,
): Promise<T | null> {
  let raw: string | null;
  try {
    raw = await chat({ ...options, json: true });
  } catch {
    return null;
  }
  if (!raw) return null;

  const candidate = extractJsonObject(raw);
  if (!candidate) return null;

  try {
    return validate(JSON.parse(candidate));
  } catch {
    return null;
  }
}

function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return body.slice(start, end + 1);
}
