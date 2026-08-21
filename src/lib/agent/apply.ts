import { escapeHtml } from "../resume-render";
import { sendMail, type SendResult } from "../mail";
import type { Application, ApplicationChannel, Job, Profile } from "../types";

export function channelFor(job: Job): ApplicationChannel {
  return job.applyEmail ? "email" : "external_form";
}

function subjectFor(job: Job, profile: Profile): string {
  return `Application: ${job.title} — ${profile.fullName}`;
}

function textBody(job: Job, profile: Profile, application: Pick<Application, "coverLetter" | "resumeMarkdown">): string {
  return [
    application.coverLetter,
    "",
    "—".repeat(20),
    "",
    `Resume — ${profile.fullName}`,
    "",
    application.resumeMarkdown,
    "",
    `Posting reference: ${job.url}`,
  ].join("\n");
}

function htmlBody(job: Job, profile: Profile, application: Pick<Application, "coverLetter" | "resumeMarkdown">): string {
  const letter = application.coverLetter
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 14px">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("\n");

  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:640px">
${letter}
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
<p style="margin:0 0 6px;font-size:13px;color:#6b7280">Resume attached as Markdown. Posting reference: <a href="${escapeHtml(job.url)}">${escapeHtml(job.url)}</a></p>
<p style="margin:0;font-size:13px;color:#6b7280">${escapeHtml(profile.fullName)} · ${escapeHtml(profile.email)}${profile.phone ? ` · ${escapeHtml(profile.phone)}` : ""}</p>
</div>`;
}

export interface SubmitOutcome {
  submitted: boolean;
  result: SendResult | null;
  message: string;
}

/**
 * Sends an email application for postings that advertise an address. Postings
 * behind an ATS form are never auto-filled: scripted form submission violates
 * most job boards' terms of service, so those are handed back for review.
 */
export async function submitByEmail(
  job: Job,
  profile: Profile,
  application: Pick<Application, "coverLetter" | "resumeMarkdown">,
): Promise<SubmitOutcome> {
  if (!job.applyEmail) {
    return {
      submitted: false,
      result: null,
      message: "This posting has no application address, so it has to be submitted through its own form.",
    };
  }

  const slug = `${profile.fullName.replace(/\s+/g, "-")}-${job.company.replace(/\s+/g, "-")}`.toLowerCase();
  const result = await sendMail({
    to: job.applyEmail,
    subject: subjectFor(job, profile),
    text: textBody(job, profile, application),
    html: htmlBody(job, profile, application),
    attachments: [
      {
        filename: `${slug}-resume.md`,
        content: application.resumeMarkdown,
        contentType: "text/markdown",
      },
    ],
  });

  if (result.transport === "smtp" && result.ok) {
    return { submitted: true, result, message: `Emailed to ${job.applyEmail}. ${result.detail}` };
  }

  return {
    submitted: false,
    result,
    message: result.ok
      ? `Application drafted but not delivered: ${result.detail}`
      : `Application could not be delivered: ${result.error ?? result.detail}`,
  };
}
