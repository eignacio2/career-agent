import { escapeHtml } from "../resume-render";
import type { Application, DigestStats, Job, Profile } from "../types";

export interface DigestInput {
  profile: Profile;
  runDate: string;
  stats: DigestStats;
  submitted: { application: Application; job: Job }[];
  awaitingReview: { application: Application; job: Job }[];
  skipped: { job: Job; reason: string }[];
  notes: string[];
  appBaseUrl: string;
}

export interface BuiltDigest {
  subject: string;
  html: string;
  text: string;
}

function scoreLabel(job: Job): string {
  return job.score === null ? "unscored" : `${Math.round(job.score)}/100`;
}

function jobLine(job: Job): string {
  const bits = [job.location || "location not stated"];
  if (job.salaryText) bits.push(job.salaryText);
  return bits.join(" · ");
}

export function buildDigest(input: DigestInput): BuiltDigest {
  const { profile, stats, submitted, awaitingReview, skipped, notes, appBaseUrl } = input;
  const date = new Date(input.runDate).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const subject =
    stats.submitted > 0
      ? `${stats.submitted} application${stats.submitted === 1 ? "" : "s"} sent · ${stats.awaitingReview} awaiting your review`
      : stats.awaitingReview > 0
        ? `${stats.awaitingReview} application${stats.awaitingReview === 1 ? "" : "s"} ready for your review`
        : `No new matches today · ${stats.discovered} postings screened`;

  return { subject, html: renderHtml(subject, date, input), text: renderText(subject, date, input) };

  function renderText(subjectLine: string, dateLabel: string, data: DigestInput): string {
    const lines: string[] = [
      `Job search digest — ${dateLabel}`,
      subjectLine,
      "",
      `Screened ${stats.discovered} new postings · scored ${stats.scored} · sent ${stats.submitted} · awaiting review ${stats.awaitingReview} · skipped ${stats.skipped}`,
      "",
    ];

    if (submitted.length > 0) {
      lines.push("APPLICATIONS SENT", "");
      for (const entry of submitted) {
        lines.push(
          `• ${entry.job.title} — ${entry.job.company} (${scoreLabel(entry.job)})`,
          `  ${jobLine(entry.job)}`,
          `  ${entry.job.url}`,
          "",
        );
      }
    }

    if (awaitingReview.length > 0) {
      lines.push("READY FOR YOUR REVIEW", "");
      for (const entry of awaitingReview) {
        const why =
          entry.application.channel === "external_form"
            ? "needs submitting through the company's own form"
            : "ready to send by email";
        lines.push(
          `• ${entry.job.title} — ${entry.job.company} (${scoreLabel(entry.job)}) — ${why}`,
          `  ${jobLine(entry.job)}`,
          `  Review: ${appBaseUrl}/applications/${entry.application.id}`,
          `  Posting: ${entry.job.url}`,
          "",
        );
      }
    }

    if (skipped.length > 0) {
      lines.push("SKIPPED", "");
      for (const entry of skipped.slice(0, 12)) {
        lines.push(`• ${entry.job.title} — ${entry.job.company} (${scoreLabel(entry.job)}): ${entry.reason}`);
      }
      lines.push("");
    }

    if (notes.length > 0) {
      lines.push("RUN NOTES", "");
      for (const note of notes) lines.push(`• ${note}`);
      lines.push("");
    }

    lines.push(`Dashboard: ${appBaseUrl}`, `Sent to ${profile.digestEmail} by your career agent.`);
    void data;
    return lines.join("\n");
  }
}

function statCell(label: string, value: number | string, accent: string): string {
  return `<td style="padding:0 6px" width="20%">
  <div style="background:${accent};border-radius:10px;padding:12px 10px;text-align:center">
    <div style="font-size:22px;font-weight:650;color:#0f172a;line-height:1.1">${value}</div>
    <div style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:.04em;margin-top:4px">${label}</div>
  </div>
</td>`;
}

function cardHtml(job: Job, meta: string, actionLabel: string, actionUrl: string): string {
  const score = job.score === null ? null : Math.round(job.score);
  const scoreColor = score === null ? "#64748b" : score >= 80 ? "#047857" : score >= 65 ? "#b45309" : "#64748b";

  return `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin:0 0 10px">
  <div style="display:block">
    <span style="font-size:15px;font-weight:650;color:#0f172a">${escapeHtml(job.title)}</span>
    <span style="font-size:15px;color:#475569"> · ${escapeHtml(job.company)}</span>
  </div>
  <div style="font-size:12px;color:#64748b;margin-top:4px">${escapeHtml(jobLine(job))}</div>
  <div style="font-size:12px;margin-top:8px">
    <span style="color:${scoreColor};font-weight:600">${score === null ? "Unscored" : `Match ${score}/100`}</span>
    ${job.scoreVerdict ? `<span style="color:#94a3b8"> · ${escapeHtml(job.scoreVerdict)}</span>` : ""}
  </div>
  ${
    job.scoreReasons.length > 0
      ? `<div style="font-size:12px;color:#475569;margin-top:8px;line-height:1.55">${escapeHtml(job.scoreReasons[0])}</div>`
      : ""
  }
  <div style="font-size:12px;color:#64748b;margin-top:10px">${escapeHtml(meta)}</div>
  <div style="margin-top:12px">
    <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:12px;font-weight:600;padding:8px 14px;border-radius:8px">${escapeHtml(actionLabel)}</a>
    <a href="${escapeHtml(job.url)}" style="display:inline-block;color:#334155;text-decoration:none;font-size:12px;font-weight:600;padding:8px 12px">View posting</a>
  </div>
</div>`;
}

function sectionHtml(title: string, subtitle: string, body: string): string {
  if (!body) return "";
  return `<div style="margin:26px 0 0">
  <div style="font-size:13px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(title)}</div>
  <div style="font-size:12px;color:#64748b;margin:4px 0 12px">${escapeHtml(subtitle)}</div>
  ${body}
</div>`;
}

function renderHtml(subject: string, dateLabel: string, input: DigestInput): string {
  const { profile, stats, submitted, awaitingReview, skipped, notes, appBaseUrl } = input;

  const submittedBody = submitted
    .map((entry) =>
      cardHtml(
        entry.job,
        `Sent ${entry.application.submittedAt ? new Date(entry.application.submittedAt).toLocaleString("en-US") : "today"} to ${entry.job.applyEmail ?? "the posting's address"}.`,
        "See what was sent",
        `${appBaseUrl}/applications/${entry.application.id}`,
      ),
    )
    .join("");

  const reviewBody = awaitingReview
    .map((entry) =>
      cardHtml(
        entry.job,
        entry.application.channel === "external_form"
          ? "Resume and cover letter are prepared. This company takes applications through its own form, so the final submit is yours."
          : "Resume and cover letter are prepared and ready to send by email.",
        entry.application.channel === "external_form" ? "Open application pack" : "Review and send",
        `${appBaseUrl}/applications/${entry.application.id}`,
      ),
    )
    .join("");

  const skippedBody =
    skipped.length > 0
      ? `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:4px 16px">${skipped
          .slice(0, 12)
          .map(
            (entry) =>
              `<div style="padding:10px 0;border-bottom:1px solid #f1f5f9">
  <div style="font-size:13px;color:#0f172a">${escapeHtml(entry.job.title)} <span style="color:#64748b">· ${escapeHtml(entry.job.company)}</span></div>
  <div style="font-size:12px;color:#64748b;margin-top:3px">${escapeHtml(scoreLabel(entry.job))} — ${escapeHtml(entry.reason)}</div>
</div>`,
          )
          .join("")}</div>`
      : "";

  const notesBody =
    notes.length > 0
      ? `<div style="background:#f8fafc;border-radius:12px;padding:14px 16px;font-size:12px;color:#475569;line-height:1.6">${notes
          .map((note) => `<div style="margin:0 0 6px">• ${escapeHtml(note)}</div>`)
          .join("")}</div>`
      : "";

  const emptyState =
    submitted.length === 0 && awaitingReview.length === 0
      ? `<div style="border:1px dashed #cbd5e1;border-radius:12px;padding:22px 18px;text-align:center;margin-top:22px">
  <div style="font-size:14px;font-weight:600;color:#0f172a">Nothing cleared your bar today</div>
  <div style="font-size:12px;color:#64748b;margin-top:6px;line-height:1.6">The agent screened ${stats.discovered} new posting${stats.discovered === 1 ? "" : "s"} and none scored above your ${profile.autoApplyThreshold}/100 threshold. That is usually a quiet board rather than a problem, but if it repeats, widen your target titles or lower the threshold in Settings.</div>
  <a href="${escapeHtml(appBaseUrl)}/settings" style="display:inline-block;margin-top:14px;background:#0f172a;color:#fff;text-decoration:none;font-size:12px;font-weight:600;padding:8px 14px;border-radius:8px">Adjust search settings</a>
</div>`
      : "";

  return `<!doctype html>
<html><body style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 24px;border:1px solid #e2e8f0">
  <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;font-weight:600">Daily job search digest</div>
  <div style="font-size:22px;font-weight:680;color:#0f172a;margin-top:6px;line-height:1.25">${escapeHtml(subject)}</div>
  <div style="font-size:13px;color:#64748b;margin-top:6px">${escapeHtml(dateLabel)} · for ${escapeHtml(profile.fullName)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px -6px 0"><tr>
    ${statCell("Screened", stats.discovered, "#f1f5f9")}
    ${statCell("Scored", stats.scored, "#f1f5f9")}
    ${statCell("Sent", stats.submitted, "#dcfce7")}
    ${statCell("To review", stats.awaitingReview, "#fef3c7")}
    ${statCell("Skipped", stats.skipped, "#f1f5f9")}
  </tr></table>

  ${sectionHtml("Applications sent", "Submitted by the agent on your behalf.", submittedBody)}
  ${sectionHtml("Ready for your review", "Prepared and waiting on you.", reviewBody)}
  ${emptyState}
  ${sectionHtml("Screened out", "Postings the agent found but did not pursue.", skippedBody)}
  ${sectionHtml("Run notes", "How this run went.", notesBody)}

  <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.6">
    <a href="${escapeHtml(appBaseUrl)}" style="color:#0f172a;font-weight:600;text-decoration:none">Open the dashboard</a> to change your targets, edit your resume, or turn autopilot on and off.
    <div style="margin-top:8px">Sent to ${escapeHtml(profile.digestEmail)} by your career agent.</div>
  </div>
</div>
</body></html>`;
}
