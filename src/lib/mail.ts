import fs from "node:fs";
import path from "node:path";

export interface MailAttachment {
  filename: string;
  content: string;
  contentType?: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
}

export interface SendResult {
  ok: boolean;
  /** "smtp" when actually delivered, "outbox" when written to disk instead. */
  transport: "smtp" | "outbox";
  detail: string;
  error?: string;
}

const OUTBOX_DIR = path.join(process.cwd(), ".data", "outbox");

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    user: process.env.SMTP_USER?.trim() || undefined,
    pass: process.env.SMTP_PASS?.trim() || undefined,
    from: process.env.MAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || `career-agent@${host}`,
  };
}

export function isSmtpConfigured(): boolean {
  return getSmtpConfig() !== null;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

/**
 * Writes the message to `.data/outbox` so the agent can run end to end without
 * SMTP credentials. The dashboard reads these back as previewable mail.
 */
function writeToOutbox(message: MailMessage): SendResult {
  try {
    fs.mkdirSync(OUTBOX_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = `${stamp}__${slugify(message.subject) || "message"}`;

    fs.writeFileSync(
      path.join(OUTBOX_DIR, `${base}.html`),
      `<!doctype html><meta charset="utf-8"><title>${message.subject}</title>\n<!-- to: ${message.to} -->\n${message.html}`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(OUTBOX_DIR, `${base}.txt`),
      `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`,
      "utf8",
    );

    for (const attachment of message.attachments ?? []) {
      fs.writeFileSync(path.join(OUTBOX_DIR, `${base}__${attachment.filename}`), attachment.content, "utf8");
    }

    return {
      ok: true,
      transport: "outbox",
      detail: `SMTP is not configured, so the message was written to .data/outbox/${base}.html instead of being sent.`,
    };
  } catch (error) {
    return {
      ok: false,
      transport: "outbox",
      detail: "Could not write the message to the local outbox.",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendMail(message: MailMessage): Promise<SendResult> {
  const config = getSmtpConfig();
  if (!config) return writeToOutbox(message);

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
    });

    const info = await transporter.sendMail({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });

    return {
      ok: true,
      transport: "smtp",
      detail: `Delivered via ${config.host} (message id ${info.messageId}).`,
    };
  } catch (error) {
    const fallback = writeToOutbox(message);
    return {
      ok: fallback.ok,
      transport: "outbox",
      detail: `SMTP delivery failed, so the message was saved to the local outbox instead. ${fallback.detail}`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
