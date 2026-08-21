import { chatJson, isLlmConfigured, llmModelLabel } from "../llm";
import type { Job, LinkedInPack, Profile, Resume } from "../types";
import { extractJobSkills } from "./score";

export type GeneratedPack = Omit<LinkedInPack, "id" | "createdAt">;

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

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function heuristicPack(profile: Profile, resume: Resume, jobs: Job[]): GeneratedPack {
  const owned = new Set(
    [...profile.skills, ...resume.skillGroups.flatMap((group) => group.items)].map((s) => s.toLowerCase()),
  );
  const demand = marketDemand(jobs);
  const validated = demand.filter((entry) => owned.has(entry.skill.toLowerCase()));
  const gaps = demand.filter((entry) => !owned.has(entry.skill.toLowerCase())).slice(0, 6);

  const primaryTitles = profile.targetTitles.slice(0, 2).join(" / ") || "Data Scientist";
  const headlineSkills = validated.slice(0, 4).map((entry) => titleCase(entry.skill));
  const headline = `${primaryTitles} · ${headlineSkills.length > 0 ? headlineSkills.join(" · ") : "Production ML"} · ${profile.remotePreference === "remote" ? "Open to remote" : `Based in ${profile.location}`}`.slice(0, 220);

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
    ...validated.map((entry) => titleCase(entry.skill)),
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
    openToWork: `Open to ${profile.targetTitles.slice(0, 4).join(", ")} · ${profile.remotePreference === "remote" ? "Remote (US)" : profile.targetLocations.slice(0, 2).join(", ")} · Starting immediately`,
    rationale,
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
): Promise<GeneratedPack> {
  const heuristic = heuristicPack(profile, resume, jobs);
  if (!isLlmConfigured()) return heuristic;

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
${demand.map((entry) => `${entry.skill}: ${entry.count}`).join("\n") || "no live postings available"}`;

  const llm = await chatJson<Partial<GeneratedPack>>(
    { system: LINKEDIN_SYSTEM, user: prompt, maxTokens: 2200, temperature: 0.4 },
    validatePack,
  );
  if (!llm) return heuristic;

  return {
    headline: llm.headline || heuristic.headline,
    about: llm.about || heuristic.about,
    skills: llm.skills?.length ? llm.skills : heuristic.skills,
    experienceRewrites: llm.experienceRewrites?.length
      ? llm.experienceRewrites
      : heuristic.experienceRewrites,
    openToWork: llm.openToWork || heuristic.openToWork,
    rationale: llm.rationale?.length ? llm.rationale : heuristic.rationale,
    generatedBy: llmModelLabel(),
  };
}
