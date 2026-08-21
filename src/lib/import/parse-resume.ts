import { chatJson, isLlmConfigured, llmModelLabel } from "../llm";
import { DEFAULT_RESUME } from "../seed";
import type {
  Profile,
  Resume,
  ResumeEducation,
  ResumeExperience,
  ResumeProject,
  ResumeSkillGroup,
} from "../types";

export interface ParsedImport {
  resume: Resume;
  profileHints: Partial<Profile>;
  engine: string;
  warnings: string[];
  stats: {
    experienceEntries: number;
    bullets: number;
    skills: number;
    educationEntries: number;
    charactersRead: number;
  };
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

/* --------------------------------- contacts -------------------------------- */

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE = /(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const LINKEDIN = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[a-z0-9-_%]+\/?/i;
const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-z0-9-_.]+\/?/i;

function normalizeUrl(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.replace(/[).,;]+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/* --------------------------------- sections -------------------------------- */

const SECTION_ALIASES: Record<string, string[]> = {
  summary: ["summary", "profile", "professional summary", "objective", "about", "about me", "overview"],
  experience: [
    "experience","work experience","professional experience","employment","employment history",
    "work history","relevant experience","career history","internships","internship experience",
  ],
  education: ["education", "academic background", "academics", "education & training"],
  skills: [
    "skills","technical skills","top skills","core skills","core competencies","technologies",
    "technical proficiencies","tools & technologies","skills & tools",
  ],
  projects: ["projects", "selected projects", "personal projects", "side projects", "open source"],
  certifications: [
    "certifications","certification","licenses & certifications","licenses","courses",
    "courses & certifications","certifications & courses","certifications and courses",
    "training","professional development",
  ],
  // Recognised so their contents stop leaking into work experience. Clubs and
  // awards are not jobs, and parsing them as employers corrupts the history.
  other: [
    "activities","extracurricular","extracurriculars","involvement","leadership",
    "awards","honors","honours","awards & honors","publications","interests",
    "volunteering","volunteer experience","references","affiliations",
  ],
};

/** Section headings are short lines, often all-caps or title-case, with no sentence punctuation. */
function classifyHeading(line: string): string | null {
  const cleaned = line.trim().replace(/[:•|]+$/, "").replace(/^[#*\s]+/, "").trim();
  if (cleaned.length === 0 || cleaned.length > 42) return null;
  if (/[.!?]$/.test(cleaned)) return null;

  const lowered = cleaned.toLowerCase();
  for (const [section, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.includes(lowered)) return section;
  }
  return null;
}

function splitSections(text: string): { preamble: string[]; sections: Record<string, string[]> } {
  const lines = text.split("\n");
  const preamble: string[] = [];
  const sections: Record<string, string[]> = {};
  let current: string | null = null;

  for (const line of lines) {
    const heading = classifyHeading(line);
    if (heading) {
      current = heading;
      sections[current] ??= [];
      continue;
    }
    if (current) sections[current].push(line);
    else preamble.push(line);
  }

  return { preamble, sections };
}

/* -------------------------------- experience ------------------------------- */

const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DATE_RANGE = new RegExp(
  `((?:${MONTHS})\\s*\\.?\\s*\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})\\s*(?:-|–|—|to|until)\\s*((?:${MONTHS})\\s*\\.?\\s*\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4}|present|current|now)`,
  "i",
);

const BULLET = /^\s*[-•*▪◦·‣]\s*(.+)$/;

/**
 * PDF extraction preserves the printed line breaks, so a single resume bullet
 * arrives as two or three lines. A line continues the previous one when that
 * line was left unfinished, or when it opens mid-sentence.
 */
function isContinuation(line: string, previous: string | undefined): boolean {
  if (!previous) return false;
  if (/[.!?;:]$/.test(previous.trim())) return false;
  return !/^[A-Z0-9]/.test(line.trim()) || previous.trim().length > 60;
}

function appendContinuation(target: string, line: string): string {
  return `${target.replace(/\s+$/, "")} ${line.trim()}`;
}

/** Rejoins wrapped list entries, used for sections that are simple line lists. */
function mergeWrappedLines(lines: string[]): string[] {
  const merged: string[] = [];

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.length < 3) continue;

    const bullet = trimmed.match(BULLET);
    const content = (bullet ? bullet[1] : trimmed).trim();
    const last = merged[merged.length - 1];

    if (!bullet && isContinuation(content, last)) {
      merged[merged.length - 1] = appendContinuation(last, content);
      continue;
    }
    merged.push(content);
  }

  return merged.map((entry) => entry.replace(/[:\s]+$/, "")).filter((entry) => entry.length > 3);
}

function toIsoMonth(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (/^(present|current|now)$/.test(value)) return "Present";
  if (/^\d{4}$/.test(value)) return value;

  const slash = value.match(/^(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[2]}-${slash[1].padStart(2, "0")}`;

  const named = value.match(new RegExp(`^(${MONTHS})\\s*\\.?\\s*(\\d{4})$`, "i"));
  if (named) {
    const index = [
      "jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec",
    ].findIndex((month) => named[1].toLowerCase().startsWith(month));
    if (index >= 0) return `${named[2]}-${String(index + 1).padStart(2, "0")}`;
  }
  return raw.trim();
}

/** Splits "Senior Data Scientist at Northwind" or "Northwind — Senior Data Scientist". */
function splitRoleAndCompany(line: string): { role: string; company: string } {
  const cleaned = line.replace(DATE_RANGE, "").replace(/[|,–—-]\s*$/, "").trim();

  const atMatch = cleaned.match(/^(.+?)\s+(?:at|@|·)\s+(.+)$/i);
  if (atMatch) return { role: atMatch[1].trim(), company: atMatch[2].trim() };

  const dashMatch = cleaned.split(/\s+[–—|]\s+|\s{2,}/).filter(Boolean);
  if (dashMatch.length >= 2) {
    return { role: dashMatch[0].trim(), company: dashMatch[1].trim() };
  }
  return { role: cleaned, company: "" };
}

function parseExperience(lines: string[]): ResumeExperience[] {
  const entries: ResumeExperience[] = [];
  let current: ResumeExperience | null = null;

  const flush = () => {
    if (current && (current.role || current.company || current.bullets.length > 0)) {
      entries.push(current);
    }
    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "") continue;

    const bullet = line.match(BULLET);
    if (bullet && current) {
      current.bullets.push(bullet[1].trim());
      continue;
    }

    const dates = line.match(DATE_RANGE);
    if (dates) {
      // A date range marks a new role. The title sometimes shares the line and
      // sometimes sits on the line above it.
      const { role, company } = splitRoleAndCompany(line);
      const previous = index > 0 ? lines[index - 1].trim() : "";
      const inherited =
        !role && previous && !BULLET.test(previous) && !DATE_RANGE.test(previous)
          ? splitRoleAndCompany(previous)
          : null;

      flush();
      current = {
        id: nextId("exp"),
        role: role || inherited?.role || "",
        company: company || inherited?.company || "",
        location: "",
        start: toIsoMonth(dates[1]),
        end: toIsoMonth(dates[2]),
        bullets: [],
        stack: [],
      };
      continue;
    }

    if (bullet && !current) {
      current = {
        id: nextId("exp"),
        role: "",
        company: "",
        location: "",
        start: "",
        end: "",
        bullets: [bullet[1].trim()],
        stack: [],
      };
      continue;
    }

    if (!current) continue;

    const last = current.bullets[current.bullets.length - 1];
    if (isContinuation(line, last)) {
      current.bullets[current.bullets.length - 1] = appendContinuation(last, line);
      continue;
    }

    // An unbulleted sentence under a role is still an accomplishment line.
    if (line.trim().length > 40) current.bullets.push(line.trim());
  }

  flush();
  return entries;
}

/* ---------------------------------- skills --------------------------------- */

/**
 * Splits a skill list on separators that sit outside brackets, so entries like
 * "AWS (Lambda, DynamoDB, S3)" survive as one skill instead of fragmenting.
 */
function splitSkillList(value: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let buffer = "";

  for (const char of value) {
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);

    if (depth === 0 && /[,;|·•]/.test(char)) {
      items.push(buffer);
      buffer = "";
      continue;
    }
    buffer += char;
  }
  items.push(buffer);

  // Grouped entries such as "AWS (Lambda, DynamoDB, S3, CloudFormation)" are long
  // but legitimate, so the ceiling only exists to reject prose that is not a skill.
  return items.map((item) => item.trim()).filter((item) => item.length > 0 && item.length <= 100);
}

function parseSkills(lines: string[]): ResumeSkillGroup[] {
  const groups: ResumeSkillGroup[] = [];
  const loose: string[] = [];

  for (const line of lines) {
    const trimmed = line.replace(BULLET, "$1").trim();
    if (trimmed === "") continue;

    const labelled = trimmed.match(/^([A-Za-z][A-Za-z0-9 &/+#-]{2,32}):\s*(.+)$/);
    if (labelled) {
      const items = splitSkillList(labelled[2]);
      if (items.length > 0) {
        groups.push({ id: nextId("sk"), label: labelled[1].trim(), items });
        continue;
      }
    }

    loose.push(...splitSkillList(trimmed));
  }

  if (loose.length > 0) {
    groups.push({ id: nextId("sk"), label: "Skills", items: [...new Set(loose)] });
  }
  return groups;
}

/* -------------------------------- education -------------------------------- */

const DEGREE =
  /\b(b\.?s\.?c?|b\.?a\.?|m\.?s\.?c?|m\.?a\.?|m\.?b\.?a\.?|ph\.?d|bachelor|master|doctorate|associate)\b/i;

/** Strips leftover separators and collapsed whitespace after removing year ranges. */
function cleanFragment(value: string): string {
  return value
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s–—|,·-]+|[\s–—|,·-]+$/g, "")
    .trim();
}

const SCHOOL = /\b(university|college|institute|academy|school of|polytechnic)\b/i;

/**
 * Handles both single-line entries and the common two-line layout where the
 * institution sits above the degree. Lines carrying only supporting detail
 * (GPA, coursework, honours) are attached to the entry above them.
 */
function parseEducation(lines: string[]): ResumeEducation[] {
  const entries: ResumeEducation[] = [];

  for (const line of lines) {
    const trimmed = line.replace(BULLET, "$1").trim();
    if (trimmed.length < 4) continue;

    const years = [...trimmed.matchAll(/\b(19|20)\d{2}\b/g)].map((match) => match[0]);
    const hasDegree = DEGREE.test(trimmed);
    const hasSchool = SCHOOL.test(trimmed);
    const previous = entries[entries.length - 1];

    if (!hasDegree && !hasSchool) {
      if (previous) {
        previous.detail = previous.detail ? `${previous.detail} ${trimmed}` : trimmed;
        if (!previous.end && years.length > 0) previous.end = years[years.length - 1];
      }
      continue;
    }

    // A degree line directly under a bare institution line completes that entry.
    if (hasDegree && !hasSchool && previous && previous.school && !previous.degree) {
      previous.degree = cleanFragment(stripDetail(trimmed));
      if (years.length > 0) previous.end = years[years.length - 1];
      if (years.length > 1) previous.start = years[0];
      const detail = extractDetail(trimmed);
      if (detail) previous.detail = previous.detail ? `${previous.detail} ${detail}` : detail;
      continue;
    }

    const parts = trimmed.split(/\s+[–—|·]\s+|,\s+|\s{2,}/).map((part) => part.trim()).filter(Boolean);
    const degreePart = parts.find((part) => DEGREE.test(part)) ?? (hasDegree ? trimmed : "");
    const schoolPart = parts.find((part) => SCHOOL.test(part)) ?? (hasSchool ? parts[0] ?? "" : "");

    entries.push({
      id: nextId("edu"),
      degree: cleanFragment(stripDetail(degreePart)),
      school: cleanFragment(schoolPart),
      start: years.length > 1 ? years[0] : "",
      end: years.length > 0 ? years[years.length - 1] : "",
      detail: extractDetail(trimmed),
    });
  }

  return entries.filter((entry) => entry.degree || entry.school);
}

const DETAIL_LABEL = /\b(GPA|Expected\s+Graduation|Graduation|Honors|Honours|Dean's\s+List|Minor)\b[:\s]*/i;

function stripDetail(value: string): string {
  const index = value.search(DETAIL_LABEL);
  return index >= 0 ? value.slice(0, index) : value;
}

function extractDetail(value: string): string {
  const index = value.search(DETAIL_LABEL);
  return index >= 0 ? value.slice(index).replace(/\s{2,}/g, " ").trim() : "";
}

/* --------------------------------- projects -------------------------------- */

const URL_ANYWHERE = /(?:https?:\/\/|(?:www\.)?github\.com\/|(?:www\.)?gitlab\.com\/)\S+/i;

/**
 * Project entries are a title line, optionally carrying a link, followed by one
 * or more prose lines. Separators are only honoured when surrounded by
 * whitespace, so hyphenated words like "red-light" are not split apart.
 */
function parseProjects(lines: string[]): ResumeProject[] {
  const projects: ResumeProject[] = [];
  let current: ResumeProject | null = null;

  const push = () => {
    if (current && current.name) projects.push(current);
    current = null;
  };

  for (const raw of lines) {
    const trimmed = raw.replace(BULLET, "$1").trim();
    if (trimmed.length < 4) continue;

    const url = trimmed.match(URL_ANYWHERE)?.[0]?.replace(/[).,;]+$/, "") ?? "";
    const withoutUrl = url ? trimmed.replace(url, "").trim() : trimmed;
    const looksLikeTitle =
      Boolean(url) || (withoutUrl.length <= 70 && !/[.!?]$/.test(withoutUrl) && !/^[a-z]/.test(withoutUrl));

    if (looksLikeTitle) {
      push();
      // "Name - description" and "Name: description" both appear in practice.
      const split = withoutUrl.match(/^(.{2,60}?)(?:\s+[–—-]\s+|:\s+)(.+)$/);
      current = {
        id: nextId("prj"),
        name: cleanFragment(split?.[1] ?? withoutUrl) || withoutUrl,
        url: normalizeUrl(url),
        description: split?.[2]?.trim() ?? "",
        stack: [],
      };
      continue;
    }

    if (current) {
      current.description = current.description ? `${current.description} ${trimmed}` : trimmed;
    }
  }

  push();
  return projects;
}

/* ------------------------------ heuristic entry ----------------------------- */

function guessName(preamble: string[]): string {
  for (const raw of preamble.slice(0, 8)) {
    const line = raw.trim();
    if (line.length < 3 || line.length > 48) continue;
    if (EMAIL.test(line) || PHONE.test(line) || /https?:\/\//.test(line)) continue;
    if (classifyHeading(line)) continue;

    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 5 && /^[A-Z]/.test(line) && !/\d/.test(line)) {
      const name = line.replace(/[,|].*$/, "").trim();
      // Resume headers are often set in all caps; store it the way a person writes it.
      return name === name.toUpperCase()
        ? name
            .toLowerCase()
            .replace(/(^|[\s-])([a-z])/g, (_match, prefix: string, letter: string) => prefix + letter.toUpperCase())
        : name;
    }
  }
  return "";
}

function parseHeuristically(text: string): ParsedImport {
  const { preamble, sections } = splitSections(text);
  const head = preamble.join("\n");
  const whole = text;

  const email = whole.match(EMAIL)?.[0] ?? "";
  const phone = head.match(PHONE)?.[0] ?? whole.match(PHONE)?.[0] ?? "";
  const linkedin = normalizeUrl(whole.match(LINKEDIN)?.[0]);
  const github = normalizeUrl(whole.match(GITHUB)?.[0]);
  const name = guessName(preamble);

  const experience = parseExperience(sections.experience ?? []);
  const skillGroups = parseSkills(sections.skills ?? []);
  const education = parseEducation(sections.education ?? []);
  const projects = parseProjects(sections.projects ?? []);
  const summary = (sections.summary ?? []).join(" ").replace(/\s+/g, " ").trim();
  const certifications = mergeWrappedLines(sections.certifications ?? []);

  const links = [
    linkedin ? { label: "LinkedIn", url: linkedin } : null,
    github ? { label: "GitHub", url: github } : null,
  ].filter((link): link is { label: string; url: string } => link !== null);

  const warnings: string[] = [];
  if (experience.length === 0) {
    warnings.push(
      "No work history could be identified. The parser looks for date ranges like \"Feb 2023 – Present\" under an Experience heading.",
    );
  }
  if (skillGroups.length === 0) warnings.push("No skills section was found.");
  if (!email) warnings.push("No email address was found in the document.");

  const resume: Resume = {
    basics: {
      name: name || "",
      title: "",
      email,
      phone,
      location: "",
      links,
      summary,
    },
    skillGroups,
    experience,
    projects,
    education,
    certifications,
  };

  return {
    resume,
    profileHints: {
      ...(name ? { fullName: name } : {}),
      ...(email ? { email, digestEmail: email } : {}),
      ...(phone ? { phone } : {}),
      ...(linkedin ? { linkedinUrl: linkedin } : {}),
      ...(github ? { githubUrl: github } : {}),
      ...(summary ? { summary } : {}),
      ...(skillGroups.length > 0
        ? { skills: [...new Set(skillGroups.flatMap((group) => group.items))].slice(0, 60) }
        : {}),
    },
    engine: "built-in parser",
    warnings,
    stats: countStats(resume, text),
  };
}

function countStats(resume: Resume, text: string) {
  return {
    experienceEntries: resume.experience.length,
    bullets: resume.experience.reduce((total, role) => total + role.bullets.length, 0),
    skills: resume.skillGroups.reduce((total, group) => total + group.items.length, 0),
    educationEntries: resume.education.length,
    charactersRead: text.length,
  };
}

/* --------------------------------- LLM path -------------------------------- */

const PARSE_SYSTEM = `You convert a resume or LinkedIn profile export into structured JSON.
Hard rules:
- Transcribe only. Never invent, embellish, or infer employers, titles, dates, metrics, degrees, or skills that are not in the text.
- Preserve every number exactly as written.
- Keep each accomplishment bullet as its own string, in the order it appears. Do not merge or summarize bullets.
- Dates use YYYY-MM when a month is given, YYYY when only a year is given, and the literal "Present" for current roles.
- If a field is genuinely absent from the text, use an empty string or empty array. Do not guess.
Reply with JSON only:
{
  "fullName": string, "email": string, "phone": string, "location": string, "headline": string,
  "summary": string, "linkedinUrl": string, "githubUrl": string, "portfolioUrl": string,
  "yearsExperience": number,
  "skillGroups": [{"label": string, "items": [string]}],
  "experience": [{"company": string, "role": string, "location": string, "start": string, "end": string, "bullets": [string], "stack": [string]}],
  "projects": [{"name": string, "url": string, "description": string, "stack": [string]}],
  "education": [{"school": string, "degree": string, "start": string, "end": string, "detail": string}],
  "certifications": [string]
}
"headline" is a single line describing what this person does, drawn from the text. "yearsExperience" is computed from the earliest professional start date to today; use 0 if it cannot be determined.`;

interface LlmParsed {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  headline?: string;
  summary?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  yearsExperience?: number;
  skillGroups?: { label?: string; items?: string[] }[];
  experience?: {
    company?: string;
    role?: string;
    location?: string;
    start?: string;
    end?: string;
    bullets?: string[];
    stack?: string[];
  }[];
  projects?: { name?: string; url?: string; description?: string; stack?: string[] }[];
  education?: { school?: string; degree?: string; start?: string; end?: string; detail?: string }[];
  certifications?: string[];
}

function strings(value: unknown, limit = 40): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, limit)
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateParsed(value: unknown): LlmParsed | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  // A parse with neither a name nor any work history is not worth trusting.
  if (!text(record.fullName) && !Array.isArray(record.experience)) return null;
  return record as LlmParsed;
}

function fromLlm(parsed: LlmParsed, source: string): ParsedImport {
  const experience: ResumeExperience[] = (parsed.experience ?? []).map((entry) => ({
    id: nextId("exp"),
    company: text(entry.company),
    role: text(entry.role),
    location: text(entry.location),
    start: text(entry.start),
    end: text(entry.end),
    bullets: strings(entry.bullets, 12),
    stack: strings(entry.stack, 20),
  }));

  const skillGroups: ResumeSkillGroup[] = (parsed.skillGroups ?? [])
    .map((group) => ({
      id: nextId("sk"),
      label: text(group.label) || "Skills",
      items: strings(group.items, 40),
    }))
    .filter((group) => group.items.length > 0);

  const projects: ResumeProject[] = (parsed.projects ?? []).map((project) => ({
    id: nextId("prj"),
    name: text(project.name),
    url: text(project.url),
    description: text(project.description),
    stack: strings(project.stack, 20),
  }));

  const education: ResumeEducation[] = (parsed.education ?? []).map((entry) => ({
    id: nextId("edu"),
    school: text(entry.school),
    degree: text(entry.degree),
    start: text(entry.start),
    end: text(entry.end),
    detail: text(entry.detail),
  }));

  const linkedinUrl = normalizeUrl(text(parsed.linkedinUrl));
  const githubUrl = normalizeUrl(text(parsed.githubUrl));
  const portfolioUrl = normalizeUrl(text(parsed.portfolioUrl));

  const links = [
    linkedinUrl ? { label: "LinkedIn", url: linkedinUrl } : null,
    githubUrl ? { label: "GitHub", url: githubUrl } : null,
    portfolioUrl ? { label: "Portfolio", url: portfolioUrl } : null,
  ].filter((link): link is { label: string; url: string } => link !== null);

  const resume: Resume = {
    basics: {
      name: text(parsed.fullName),
      title: text(parsed.headline),
      email: text(parsed.email),
      phone: text(parsed.phone),
      location: text(parsed.location),
      links,
      summary: text(parsed.summary),
    },
    skillGroups,
    experience,
    projects,
    education,
    certifications: strings(parsed.certifications, 20),
  };

  const years =
    typeof parsed.yearsExperience === "number" && Number.isFinite(parsed.yearsExperience)
      ? Math.max(0, Math.min(60, Math.round(parsed.yearsExperience)))
      : undefined;

  const warnings: string[] = [];
  if (experience.length === 0) warnings.push("No work history was found in this document.");
  if (skillGroups.length === 0) warnings.push("No skills were found in this document.");

  return {
    resume,
    profileHints: {
      ...(resume.basics.name ? { fullName: resume.basics.name } : {}),
      ...(resume.basics.email ? { email: resume.basics.email, digestEmail: resume.basics.email } : {}),
      ...(resume.basics.phone ? { phone: resume.basics.phone } : {}),
      ...(resume.basics.location ? { location: resume.basics.location } : {}),
      ...(resume.basics.title ? { headline: resume.basics.title } : {}),
      ...(resume.basics.summary ? { summary: resume.basics.summary } : {}),
      ...(linkedinUrl ? { linkedinUrl } : {}),
      ...(githubUrl ? { githubUrl } : {}),
      ...(portfolioUrl ? { portfolioUrl } : {}),
      ...(years !== undefined ? { yearsExperience: years } : {}),
      ...(skillGroups.length > 0
        ? { skills: [...new Set(skillGroups.flatMap((group) => group.items))].slice(0, 60) }
        : {}),
    },
    engine: llmModelLabel(),
    warnings,
    stats: countStats(resume, source),
  };
}

/**
 * Parses resume text into the structured resume the agent tailors from. Falls
 * back to the built-in parser whenever no model is configured or the model's
 * output cannot be trusted.
 */
export async function parseResumeText(source: string): Promise<ParsedImport> {
  const trimmed = source.trim();
  if (trimmed.length < 80) {
    return {
      resume: { ...DEFAULT_RESUME, experience: [], projects: [], education: [], certifications: [] },
      profileHints: {},
      engine: "none",
      warnings: ["There was not enough readable text in that file to parse."],
      stats: { experienceEntries: 0, bullets: 0, skills: 0, educationEntries: 0, charactersRead: trimmed.length },
    };
  }

  if (isLlmConfigured()) {
    const parsed = await chatJson<LlmParsed>(
      {
        system: PARSE_SYSTEM,
        user: trimmed.slice(0, 18_000),
        maxTokens: 4000,
        temperature: 0.1,
      },
      validateParsed,
    );

    if (parsed) {
      const result = fromLlm(parsed, trimmed);
      // Guard against a model that returns well-formed but empty output.
      if (result.resume.experience.length > 0 || result.resume.basics.name) return result;
    }
  }

  const heuristic = parseHeuristically(trimmed);
  if (!isLlmConfigured()) {
    heuristic.warnings.push(
      "Parsed without a language model, so structure was inferred from formatting alone. Check every field, especially dates and where bullets landed. Setting OPENAI_API_KEY makes this substantially more accurate.",
    );
  }
  return heuristic;
}
