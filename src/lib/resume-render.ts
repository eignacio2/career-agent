import type { Resume } from "./types";

export interface RenderOptions {
  /** Overrides the resume summary with a role-specific one. */
  summary?: string;
  /** Overrides bullets per experience id, letting the tailor drop or reorder them. */
  bulletsByExperienceId?: Record<string, string[]>;
  /** Skills to surface first within each group. */
  prioritySkills?: string[];
  targetTitle?: string;
}

function formatDateRange(start: string, end: string): string {
  const label = (value: string) => {
    if (!value) return "";
    if (/^\d{4}-\d{2}$/.test(value)) {
      const [year, month] = value.split("-");
      const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString("en-US", {
        month: "short",
      });
      return `${monthName} ${year}`;
    }
    return value;
  };
  const from = label(start);
  const to = label(end);
  if (from && to) return `${from} – ${to}`;
  return from || to;
}

function orderSkills(items: string[], priority: string[]): string[] {
  if (priority.length === 0) return items;
  const normalized = new Set(priority.map((item) => item.toLowerCase()));
  const promoted = items.filter((item) => normalized.has(item.toLowerCase()));
  const rest = items.filter((item) => !normalized.has(item.toLowerCase()));
  return [...promoted, ...rest];
}

export function renderResumeMarkdown(resume: Resume, options: RenderOptions = {}): string {
  const { basics } = resume;
  const lines: string[] = [];

  lines.push(`# ${basics.name}`);
  const title = options.targetTitle || basics.title;
  if (title) lines.push(`**${title}**`);

  const contact = [basics.location, basics.email, basics.phone].filter(Boolean).join(" · ");
  const links = basics.links
    .filter((link) => link.url)
    .map((link) => `[${link.label}](${link.url})`)
    .join(" · ");
  if (contact) lines.push("", contact);
  if (links) lines.push(links);

  const summary = options.summary || basics.summary;
  if (summary) lines.push("", "## Summary", "", summary);

  if (resume.skillGroups.length > 0) {
    lines.push("", "## Skills", "");
    for (const group of resume.skillGroups) {
      const items = orderSkills(group.items, options.prioritySkills ?? []);
      if (items.length > 0) lines.push(`**${group.label}:** ${items.join(", ")}`, "");
    }
  }

  if (resume.experience.length > 0) {
    lines.push("", "## Experience", "");
    for (const role of resume.experience) {
      lines.push(`### ${role.role} — ${role.company}`);
      const meta = [role.location, formatDateRange(role.start, role.end)].filter(Boolean).join(" · ");
      if (meta) lines.push(`*${meta}*`);
      lines.push("");

      const bullets = options.bulletsByExperienceId?.[role.id] ?? role.bullets;
      for (const bullet of bullets) lines.push(`- ${bullet}`);
      if (role.stack.length > 0) {
        lines.push("", `*Stack: ${orderSkills(role.stack, options.prioritySkills ?? []).join(", ")}*`);
      }
      lines.push("");
    }
  }

  if (resume.projects.length > 0) {
    lines.push("## Projects", "");
    for (const project of resume.projects) {
      const heading = project.url ? `[${project.name}](${project.url})` : project.name;
      lines.push(`### ${heading}`);
      lines.push("", project.description);
      if (project.stack.length > 0) lines.push("", `*Stack: ${project.stack.join(", ")}*`);
      lines.push("");
    }
  }

  if (resume.education.length > 0) {
    lines.push("## Education", "");
    for (const entry of resume.education) {
      const range = formatDateRange(entry.start, entry.end);
      lines.push(`**${entry.degree}** — ${entry.school}${range ? ` (${range})` : ""}`);
      if (entry.detail) lines.push("", entry.detail);
      lines.push("");
    }
  }

  if (resume.certifications.length > 0) {
    lines.push("## Certifications", "");
    for (const certification of resume.certifications) lines.push(`- ${certification}`);
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ESCAPES[char]);
}
