import type { LinkedInSnapshot } from "../import/linkedin";
import { chatJson, isLlmConfigured, llmModelLabel } from "../llm";
import type { Job, LinkedInChange, LinkedInPack, Profile, Resume } from "../types";
import { extractJobSkills } from "./score";

export type GeneratedPack = Omit<LinkedInPack, "id" | "createdAt">;

/** Phrases that actively cost a technical candidate credibility in search. */
const WEAK_HEADLINE_PHRASES = [
  { phrase: "microsoft office", why: "Listing office software on a technical profile reads as thin experience and wastes headline keywords recruiters actually search." },
  { phrase: "seeking", why: "\"Seeking\" frames you as asking rather than offering. Lead with what you build." },
  { phrase: "internship", why: "Asking for an internship tells recruiters filtering for full-time roles to skip you." },
  { phrase: "aspiring", why: "\"Aspiring\" signals you do not yet do the work, even when you do." },
  { phrase: "passionate", why: "Every profile says passionate, so it carries no information." },
  { phrase: "looking for", why: "Describe your capability first; availability belongs in the Open To Work banner." },
  { phrase: "student", why: "Once you have graduated, \"student\" undersells you and filters you out of full-time searches." },
  { phrase: "confidence", why: "Naming a lack of confidence in your own headline invites doubt." },
];

/**
 * Compares the candidate's live profile against the recommended copy and returns
 * the specific edits worth making. This is what makes the pack actionable rather
 * than just a second opinion.
 */
function diffAgainstCurrent(
  snapshot: LinkedInSnapshot,
  proposed: { headline: string; about: string; skills: string[]; openToWork: string },
  profile: Profile,
  resume: Resume,
): LinkedInChange[] {
  const changes: LinkedInChange[] = [];
  const currentHeadline = snapshot.headline.trim();
  const loweredHeadline = currentHeadline.toLowerCase();

  const headlineProblems = WEAK_HEADLINE_PHRASES.filter((entry) =>
    loweredHeadline.includes(entry.phrase),
  );
  const mentionsTarget = /\b(ai|ml|machine learning|data|analytics|llm)\b/i.test(currentHeadline);

  if (currentHeadline && (headlineProblems.length > 0 || !mentionsTarget)) {
    const reasons = headlineProblems.map((entry) => entry.why);
    if (!mentionsTarget) {
      reasons.push(
        "Your headline never says AI, machine learning, or data, so you will not surface in the recruiter searches for the roles you want.",
      );
    }
    changes.push({
      field: "Headline",
      current: currentHeadline,
      proposed: proposed.headline,
      why: reasons.join(" "),
      severity: "critical",
    });
  }

  if (!snapshot.hasExperienceSection && resume.experience.length > 0) {
    const missing = resume.experience[0];
    changes.push({
      field: "Experience section",
      current: "No experience entries on your profile",
      proposed: `Add ${missing.role} at ${missing.company} (${missing.start} to ${missing.end})`,
      why: "Your profile has no Experience section at all. Recruiter search filters heavily on job titles held, so an empty Experience section makes you close to invisible — and this is the most relevant thing on your resume.",
      severity: "critical",
    });
  }

  const currentAbout = snapshot.about.trim();
  if (currentAbout) {
    const aboutProblems: string[] = [];
    if (!/\d/.test(currentAbout)) {
      aboutProblems.push("There is not a single number in your About section, so nothing there is verifiable.");
    }
    if (/\b(my mom|my dad|family|when I was little|growing up)\b/i.test(currentAbout)) {
      aboutProblems.push(
        "The origin story about family takes the opening lines, which is the only part LinkedIn shows before the \"see more\" cut.",
      );
    }
    if (/microsoft office/i.test(currentAbout)) {
      aboutProblems.push("Microsoft Office appears again here and should be cut.");
    }
    for (const role of resume.experience.slice(0, 1)) {
      if (!currentAbout.toLowerCase().includes(role.company.toLowerCase())) {
        aboutProblems.push(`It does not mention your ${role.company} work, which is your strongest credential.`);
      }
    }

    if (aboutProblems.length > 0) {
      changes.push({
        field: "About",
        current: currentAbout.length > 220 ? `${currentAbout.slice(0, 220)}…` : currentAbout,
        proposed: proposed.about,
        why: aboutProblems.join(" "),
        severity: "critical",
      });
    }
  }

  if (snapshot.skills.length > 0) {
    const currentTop = snapshot.skills.slice(0, 3);
    const weakTop = currentTop.filter(
      (skill) => !profile.skills.some((owned) => owned.toLowerCase() === skill.toLowerCase()),
    );
    if (weakTop.length > 0) {
      changes.push({
        field: "Top three skills",
        current: currentTop.join(", "),
        proposed: proposed.skills.slice(0, 3).join(", "),
        why: `LinkedIn weights your first three skills most heavily in recruiter search, and yours currently lead with ${weakTop.join(", ")}. Pin the three that match the roles you are applying to instead.`,
        severity: "critical",
      });
    }
  }

  const openTo = snapshot.openToWork.toLowerCase();
  if (openTo && !openTo.includes("remote") && profile.remotePreference !== "onsite") {
    changes.push({
      field: "Open to work",
      current: snapshot.openToWork,
      proposed: proposed.openToWork,
      why: "Your Open To Work banner excludes remote, which removes a large share of entry-level data and AI openings from consideration. Add Remote alongside on-site and hybrid.",
      severity: "recommended",
    });
  }

  if (!snapshot.hasCertificationsSection && resume.certifications.length > 0) {
    changes.push({
      field: "Licenses & certifications",
      current: "No certifications section",
      proposed: resume.certifications.join("; "),
      why: "Certifications on your resume are missing from LinkedIn. They are a searchable field, so adding them costs two minutes and widens your reach.",
      severity: "recommended",
    });
  }

  return changes;
}

/**
 * Ranks skills by how often they appear in the postings the agent is actually
 * finding, so the profile tracks the market rather than the candidate's habits.
 */
function marketDemand(jobs: Job[]): { skill: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    for (const skill of extractJobSkills(job)) {
      counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count);
}

const ACRONYMS = new Set([
  "sql","ai","ml","llm","llms","aws","gcp","api","apis","nlp","etl","elt","bi","ci/cd",
  "css","html","js","ui","ux","rag","mlops","gpu","cpu","nosql","json","yaml","xml","r",
]);

/**
 * Skill names are matched case-insensitively but displayed the way the candidate
 * writes them, so "sql" is never shown back to them as "Sql".
 */
function displayCasing(value: string, canonical: Map<string, string>): string {
  const lowered = value.toLowerCase().trim();
  const owned = canonical.get(lowered);
  if (owned) return owned;
  if (ACRONYMS.has(lowered)) return lowered.toUpperCase();
  return value.replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function canonicalSkillCasing(profile: Profile, resume: Resume): Map<string, string> {
  const map = new Map<string, string>();
  for (const skill of [...profile.skills, ...resume.skillGroups.flatMap((group) => group.items)]) {
    const key = skill.toLowerCase().trim();
    if (key && !map.has(key)) map.set(key, skill.trim());
  }
  return map;
}

/** Locations that describe an arrangement rather than a place. */
function physicalLocations(locations: string[]): string[] {
  return locations.filter((location) => !/^remote\b|^anywhere\b|^hybrid\b/i.test(location.trim()));
}

function openToArrangement(profile: Profile): string {
  const cities = physicalLocations(profile.targetLocations).slice(0, 2);
  const onsite = cities.length > 0 ? `on-site in ${cities.join(" or ")}` : "on-site";

  if (profile.remotePreference === "onsite") return onsite;
  if (profile.remotePreference === "remote") return "Remote (US)";
  return `Remote, hybrid, or ${onsite}`;
}

function heuristicPack(profile: Profile, resume: Resume, jobs: Job[]): GeneratedPack {
  const owned = new Set(
    [...profile.skills, ...resume.skillGroups.flatMap((group) => group.items)].map((s) => s.toLowerCase()),
  );
  const demand = marketDemand(jobs);
  const validated = demand.filter((entry) => owned.has(entry.skill.toLowerCase()));
  const gaps = demand.filter((entry) => !owned.has(entry.skill.toLowerCase())).slice(0, 6);

  const casing = canonicalSkillCasing(profile, resume);
  const primaryTitles = profile.targetTitles.slice(0, 2).join(" / ") || "Data Scientist";
  const headlineSkills = validated.slice(0, 4).map((entry) => displayCasing(entry.skill, casing));
  const arrangement =
    profile.remotePreference === "onsite"
      ? `Based in ${profile.location}`
      : profile.remotePreference === "remote"
        ? "Open to remote"
        : `${profile.location} or remote`;
  const headline = `${primaryTitles} · ${headlineSkills.length > 0 ? headlineSkills.join(" · ") : "Production ML"} · ${arrangement}`.slice(0, 220);

  const topAchievements = resume.experience
    .flatMap((role) => role.bullets.filter((bullet) => /\d/.test(bullet)).slice(0, 2))
    .slice(0, 4);

  const about = [
    profile.summary,
    "",
    "What that has looked like in practice:",
    ...topAchievements.map((bullet) => `• ${bullet}`),
    "",
    `Currently open to ${profile.targetTitles.slice(0, 3).join(", ")} roles${profile.remotePreference === "remote" ? " (remote, US)" : ` in ${profile.targetLocations.slice(0, 2).join(" or ")}`}. The fastest way to reach me is ${profile.email}.`,
  ].join("\n");

  const skills = [
    ...validated.map((entry) => displayCasing(entry.skill, casing)),
    ...profile.skills.filter((skill) => !validated.some((entry) => entry.skill.toLowerCase() === skill.toLowerCase())),
  ].slice(0, 30);

  const experienceRewrites = resume.experience.slice(0, 3).map((role) => ({
    company: role.company,
    role: role.role,
    bullets: [...role.bullets]
      .sort((a, b) => Number(/\d/.test(b)) - Number(/\d/.test(a)))
      .slice(0, 3)
      .map((bullet) => bullet.trim()),
  }));

  const rationale = [
    validated.length > 0
      ? `Ordered your headline and skills by what actually appears in the ${jobs.length} postings the agent surfaced, led by ${validated.slice(0, 5).map((e) => e.skill).join(", ")}.`
      : "No live postings were available to rank against, so this pack uses your stated skill order.",
    "Moved quantified achievements into the About section, since recruiters skim About before Experience.",
    "Trimmed each role to three bullets: LinkedIn truncates long entries behind a 'see more' link.",
    gaps.length > 0
      ? `Recurring requirements you do not currently list: ${gaps.map((entry) => entry.skill).join(", ")}. Add them only if you can defend them in an interview.`
      : "No high-frequency requirements are missing from your listed skills.",
  ];

  return {
    headline,
    about,
    skills,
    experienceRewrites,
    openToWork: `Open to ${profile.targetTitles.slice(0, 4).join(", ")} · ${openToArrangement(profile)} · Starting immediately`,
    rationale,
    changes: [],
    generatedBy: "heuristic",
  };
}

function validatePack(value: unknown): Partial<GeneratedPack> | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.headline !== "string" || typeof record.about !== "string") return null;

  const strings = (input: unknown, limit: number): string[] =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === "string").slice(0, limit) : [];

  const rewrites: GeneratedPack["experienceRewrites"] = [];
  if (Array.isArray(record.experienceRewrites)) {
    for (const entry of record.experienceRewrites) {
      if (typeof entry !== "object" || entry === null) continue;
      const item = entry as Record<string, unknown>;
      if (typeof item.company !== "string" || typeof item.role !== "string") continue;
      rewrites.push({ company: item.company, role: item.role, bullets: strings(item.bullets, 4) });
    }
  }

  return {
    headline: record.headline.slice(0, 220),
    about: record.about,
    skills: strings(record.skills, 30),
    experienceRewrites: rewrites,
    openToWork: typeof record.openToWork === "string" ? record.openToWork : "",
    rationale: strings(record.rationale, 6),
  };
}

const LINKEDIN_SYSTEM = `You rewrite one candidate's LinkedIn profile so it ranks well in recruiter search for data science and AI engineering roles.
Hard rules:
- Never invent employers, titles, dates, metrics, or skills. Reorder, trim, and rephrase only. Preserve every number exactly.
- The headline is at most 220 characters, keyword-dense, and free of "passionate", "guru", "ninja", and "results-driven".
- The About section is 3-5 short paragraphs in first person, opens with what the candidate does rather than a story, and includes quantified proof.
- Skills are ordered by how often they appear in the supplied live postings, and only include skills the candidate already claims.
Reply with JSON only:
{"headline": string, "about": string, "skills": [string], "experienceRewrites": [{"company": string, "role": string, "bullets": [string]}], "openToWork": string, "rationale": [string]}
"rationale" holds 3-4 short items explaining the specific edits and why they help recruiter search.`;

export async function generateLinkedInPack(
  profile: Profile,
  resume: Resume,
  jobs: Job[],
  snapshot?: LinkedInSnapshot | null,
): Promise<GeneratedPack> {
  const heuristic = heuristicPack(profile, resume, jobs);
  const withChanges = (pack: GeneratedPack): GeneratedPack =>
    snapshot
      ? { ...pack, changes: diffAgainstCurrent(snapshot, pack, profile, resume) }
      : pack;

  if (!isLlmConfigured()) return withChanges(heuristic);

  const demand = marketDemand(jobs).slice(0, 25);
  const prompt = `CANDIDATE
${profile.fullName} — ${profile.headline}
${profile.yearsExperience} years experience · ${profile.location} · prefers ${profile.remotePreference}
Contact: ${profile.email}
Claimed skills: ${profile.skills.join(", ")}
Current summary: ${profile.summary}
Target titles: ${profile.targetTitles.join(", ")}

EXPERIENCE
${resume.experience
  .map(
    (role) =>
      `${role.role} at ${role.company} (${role.start} to ${role.end})\n${role.bullets.map((b) => `  - ${b}`).join("\n")}`,
  )
  .join("\n\n")}

DEMAND SIGNAL — requirement frequency across ${jobs.length} live postings the agent surfaced
${demand.map((entry) => `${entry.skill}: ${entry.count}`).join("\n") || "no live postings available"}
${
  snapshot
    ? `
CURRENT LINKEDIN PROFILE — rewrite this, and be specific about what is wrong with it
Headline: ${snapshot.headline || "(empty)"}
About: ${snapshot.about || "(empty)"}
Top skills in order: ${snapshot.skills.slice(0, 10).join(", ") || "(none listed)"}
Open to work: ${snapshot.openToWork || "(not set)"}
Has an Experience section: ${snapshot.hasExperienceSection ? "yes" : "NO — this is a serious omission"}
Has a certifications section: ${snapshot.hasCertificationsSection ? "yes" : "no"}`
    : ""
}`;

  const llm = await chatJson<Partial<GeneratedPack>>(
    { system: LINKEDIN_SYSTEM, user: prompt, maxTokens: 2200, temperature: 0.4 },
    validatePack,
  );
  if (!llm) return withChanges(heuristic);

  return withChanges({
    headline: llm.headline || heuristic.headline,
    about: llm.about || heuristic.about,
    skills: llm.skills?.length ? llm.skills : heuristic.skills,
    experienceRewrites: llm.experienceRewrites?.length
      ? llm.experienceRewrites
      : heuristic.experienceRewrites,
    openToWork: llm.openToWork || heuristic.openToWork,
    rationale: llm.rationale?.length ? llm.rationale : heuristic.rationale,
    changes: [],
    generatedBy: llmModelLabel(),
  });
}
