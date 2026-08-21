export interface LinkedInSnapshot {
  profileUrl: string;
  name: string;
  headline: string;
  about: string;
  openToWork: string;
  skills: string[];
  projects: { name: string; description: string }[];
  education: string[];
  /** LinkedIn renders these only when populated; absence is itself a finding. */
  hasExperienceSection: boolean;
  hasCertificationsSection: boolean;
}

/**
 * Everything from these markers onward is LinkedIn's own furniture rather than
 * the person's profile: recommendation rails, adverts, and the site footer. The
 * profile proper always ends before them, so truncating here removes the bulk of
 * the noise a "Print to PDF" drags in.
 */
const END_OF_PROFILE_MARKERS = [
  /^interests$/i,
  /^people you may know$/i,
  /^who your viewers also viewed$/i,
  /^you might like$/i,
  /^pages for you$/i,
  /^promoted$/i,
  /^linkedin corporation/i,
  /^more profiles for you$/i,
];

/** Line-level chrome that appears inside the profile region. */
const CHROME_PATTERNS: RegExp[] = [
  /^\d+\/\d+\/\d+,\s*\d+:\d+\s*(AM|PM)/i,
  /\|\s*LinkedIn\s*$/i,
  /^https?:\/\/(www\.)?linkedin\.com\/in\//i,
  /^(www\.)?linkedin\.com\/in\//i,
  /^--\s*\d+\s+of\s+\d+\s*--$/,
  /^(Retry Premium|Premium|Try Premium|Retry Premium for)/i,
  /^\d[\d,]*\+?\s*(connections|followers|profile views|post impressions|search appearances)/i,
  /^(Show all|Show details|Show more|See all|View|Connect|Follow|Following|Message|Send)$/i,
  /^(Open to|Add section|Enhance profile|Resources|Add profile section)$/i,
  /^(Suggested for you|Private to you|Analytics|Connected apps)$/i,
  /^(Create a post|Start a post|Add connected apps|Get started|Contact info)$/i,
  /^(Profile language|Public profile & URL|English|English \(English\))$/i,
  /^(Past \d+ days|1-month free trial|Select language)/i,
  /increase your visibility/i,
  /millions of other members use Premium/i,
  /^Share that you.{0,3}re hiring/i,
  /^Stand out with a custom call-to-action/i,
  /^Discover who.{0,3}s viewed your profile/i,
  /^Add the products you use/i,
  // The "Connected apps" row prints as a single space-separated line of tool names.
  /^(Gamma|IntelliJ IDEA|IntelliJ|HubSpot|Replit|VS Code|Notion|Figma|GitHub Copilot)(\s+(Gamma|IntelliJ IDEA|IntelliJ|HubSpot|Replit|VS Code|Notion|Figma|GitHub Copilot))*$/,
  /^\d+$/,
];

const SECTION_HEADINGS: Record<string, RegExp> = {
  about: /^about$/i,
  activity: /^activity$/i,
  experience: /^experience$/i,
  education: /^education$/i,
  projects: /^projects$/i,
  skills: /^skills(\s*\(\d+\))?$/i,
  certifications: /^(licenses\s*&\s*certifications|certifications|licenses)$/i,
  courses: /^courses(\s*&\s*certifications)?$/i,
  volunteering: /^volunteer(ing| experience)$/i,
  honors: /^(honors\s*&\s*awards|honors|awards)$/i,
  recommendations: /^recommendations$/i,
  publications: /^publications$/i,
  languages: /^languages$/i,
};

function isChrome(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return true;
  return CHROME_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function headingOf(line: string): string | null {
  const cleaned = line.trim();
  for (const [name, pattern] of Object.entries(SECTION_HEADINGS)) {
    if (pattern.test(cleaned)) return name;
  }
  return null;
}

/** Drops the recommendation rails and footer, keeping the profile itself. */
function profileRegion(lines: string[]): string[] {
  const end = lines.findIndex((line) => END_OF_PROFILE_MARKERS.some((p) => p.test(line.trim())));
  return end === -1 ? lines : lines.slice(0, end);
}

export function cleanLinkedInExport(raw: string): string {
  const normalized = raw
    .split("\n")
    .map((line) => line.replace(/\t+/g, " ").replace(/\s{2,}/g, " ").trim());

  return profileRegion(normalized)
    .filter((line) => line.length > 0 && !isChrome(line))
    .join("\n");
}

export function looksLikeLinkedInExport(raw: string): boolean {
  const lowered = raw.toLowerCase();
  const signals = ["linkedin.com/in/", "| linkedin", "connections", "open to work", "followers"];
  return signals.filter((signal) => lowered.includes(signal)).length >= 2;
}

/** Turns the profile URL slug into the display name, e.g. ethan-ignacio → Ethan Ignacio. */
function nameFromSlug(profileUrl: string): string {
  const slug = profileUrl.match(/\/in\/([\w-]+)/)?.[1];
  if (!slug) return "";
  return slug
    .split("-")
    .filter((part) => part.length > 0 && !/^\d+$/.test(part) && !/^[0-9a-f]{6,}$/i.test(part))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const SKILL_NOISE = /^(show all|endorsements?|\d+ endorsements?|companies|schools)$/i;

export function parseLinkedInSnapshot(raw: string): LinkedInSnapshot {
  const allLines = raw.split("\n").map((line) => line.replace(/\t+/g, " ").replace(/\s{2,}/g, " ").trim());
  const region = profileRegion(allLines);
  const lines = region.filter((line) => line.length > 0 && !isChrome(line));

  const urlMatch = raw.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i)?.[0] ?? "";
  const profileUrl = urlMatch
    ? `https://www.linkedin.com/in/${urlMatch.match(/\/in\/([\w-]+)/)?.[1] ?? ""}`
    : "";

  const sections = new Map<string, string[]>();
  const preamble: string[] = [];
  let current: string | null = null;

  for (const line of lines) {
    const heading = headingOf(line);
    if (heading) {
      current = heading;
      if (!sections.has(heading)) sections.set(heading, []);
      continue;
    }
    if (current) sections.get(current)!.push(line);
    else preamble.push(line);
  }

  const slugName = nameFromSlug(profileUrl);
  const name =
    slugName ||
    preamble.find(
      (line) =>
        line.split(/\s+/).length >= 2 &&
        line.split(/\s+/).length <= 4 &&
        /^[A-Z]/.test(line) &&
        !/[|·,]/.test(line) &&
        !/\d/.test(line),
    ) ||
    "";

  // The headline sits above the About section and is the one block that uses
  // pipe separators, which LinkedIn users overwhelmingly favour.
  const headlineLines: string[] = [];
  for (const line of preamble) {
    if (line === name) continue;
    if (/^open to work/i.test(line) || /^chicago|^remote|^hybrid/i.test(line)) continue;
    if (line.includes("|") || headlineLines.length > 0) {
      headlineLines.push(line);
      // A headline ends at a line without a trailing separator and with sentence punctuation.
      if (/[.]$/.test(line) && !line.endsWith("|")) break;
    }
  }
  const headline =
    headlineLines.join(" ").replace(/\s*\|\s*/g, " | ").replace(/\s+/g, " ").trim() ||
    preamble.filter((line) => line !== name && line.length > 30).sort((a, b) => b.length - a.length)[0] ||
    "";

  const openToWork =
    region.find((line) => /(on-?site|hybrid|remote)/i.test(line) && /\||·/.test(line) && line.length < 60) ??
    (raw.toLowerCase().includes("open to work") ? "Open to work" : "");

  const about = (sections.get("about") ?? []).join(" ").replace(/\s+/g, " ").trim();

  const skills = [...new Set((sections.get("skills") ?? []).filter((line) => !SKILL_NOISE.test(line)))];

  const projectLines = sections.get("projects") ?? [];
  const projects: { name: string; description: string }[] = [];
  let lastDescribed: { name: string; description: string } | null = null;

  for (const line of projectLines) {
    const isDate = /^\w{3,9}\s+\d{4}\s*[–-]/.test(line) || /^\d{4}\s*[–-]/.test(line);
    // LinkedIn prints an attached skill-tag line under each project.
    const isSkillTags =
      /^associated with/i.test(line) ||
      /\+\d+ skills?$/i.test(line) ||
      /\(programming language\)/i.test(line);
    if (isDate || isSkillTags) continue;

    // PDF wrapping splits descriptions mid-sentence; those continue the line above.
    if (/^[a-z]/.test(line)) {
      if (lastDescribed) {
        lastDescribed.description = `${lastDescribed.description} ${line}`.trim();
      }
      continue;
    }

    if (/^used /i.test(line) || line.length > 70) {
      const target = projects.find((project) => project.description === "");
      if (target) {
        target.description = line;
        lastDescribed = target;
      }
      continue;
    }

    if (line.length <= 60) projects.push({ name: line, description: "" });
  }

  const education = (sections.get("education") ?? []).filter(
    (line) => !/(\+\d+ skills?$|^quick learning)/i.test(line),
  );

  return {
    profileUrl,
    name,
    headline,
    about,
    openToWork,
    skills,
    projects,
    education,
    hasExperienceSection: (sections.get("experience") ?? []).length > 0,
    hasCertificationsSection:
      (sections.get("certifications") ?? []).length > 0 || (sections.get("courses") ?? []).length > 0,
  };
}
