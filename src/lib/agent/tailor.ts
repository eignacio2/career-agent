import { chatJson, isLlmConfigured } from "../llm";
import { renderResumeMarkdown } from "../resume-render";
import type { Job, Profile, Resume, TailoredApplication } from "../types";
import { extractJobSkills } from "./score";

const MAX_BULLETS_PER_ROLE = 4;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#. ]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3),
  );
}

function relevanceScore(bullet: string, jobTokens: Set<string>, jobSkills: string[]): number {
  const bulletLower = bullet.toLowerCase();
  const skillHits = jobSkills.filter((skill) => bulletLower.includes(skill)).length * 3;
  const tokenHits = [...tokenize(bullet)].filter((word) => jobTokens.has(word)).length;
  // Quantified bullets read better under a six-second skim, so nudge them up.
  const hasMetric = /\d/.test(bullet) ? 1.5 : 0;
  return skillHits + tokenHits + hasMetric;
}

function selectBullets(resume: Resume, job: Job): Record<string, string[]> {
  const jobTokens = tokenize(`${job.title} ${job.description}`);
  const jobSkills = extractJobSkills(job);
  const selection: Record<string, string[]> = {};

  for (const role of resume.experience) {
    const ranked = [...role.bullets]
      .map((bullet, index) => ({ bullet, index, score: relevanceScore(bullet, jobTokens, jobSkills) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, MAX_BULLETS_PER_ROLE)
      .sort((a, b) => a.index - b.index);
    selection[role.id] = ranked.map((entry) => entry.bullet);
  }

  return selection;
}

function matchedSkills(resume: Resume, profile: Profile, job: Job): string[] {
  const owned = new Set(
    [
      ...profile.skills,
      ...resume.skillGroups.flatMap((group) => group.items),
      ...resume.experience.flatMap((role) => role.stack),
    ].map((skill) => skill.toLowerCase()),
  );
  return extractJobSkills(job, [...owned]).filter((skill) => owned.has(skill.toLowerCase()));
}

function heuristicSummary(job: Job, profile: Profile, overlap: string[]): string {
  const focus = overlap.slice(0, 5).join(", ");
  const base = `${profile.yearsExperience}+ years building production data science and AI systems, targeting the ${job.title} role at ${job.company}.`;
  const evidence = focus
    ? ` Directly relevant overlap with this posting: ${focus}.`
    : " Comfortable owning problems from framing through deployment and monitoring.";
  return base + evidence;
}

function heuristicCoverLetter(
  job: Job,
  profile: Profile,
  resume: Resume,
  bullets: Record<string, string[]>,
  overlap: string[],
): string {
  const recent = resume.experience[0];
  const bestBullets = Object.values(bullets).flat().slice(0, 3);
  const skillLine = overlap.slice(0, 4).join(", ");
  const selfDescription = profile.headline.split(/[—|·]/)[0].trim() || "data scientist and AI engineer";

  const paragraphs = [
    `Dear ${job.company} hiring team,`,

    `I am applying for the ${job.title} role. My background is ${selfDescription}, with ${profile.yearsExperience} years of production experience, and the part of this posting that stands out to me is ${skillLine ? `the emphasis on ${skillLine}` : "the emphasis on owning systems in production rather than prototypes in notebooks"}.`,

    recent && bestBullets[0]
      ? `As ${recent.role} at ${recent.company}, I ${asClause(bestBullets[0])}`
      : "I have owned models end to end, from problem framing through deployment, monitoring, and the eventual decision to retire them.",

    bestBullets.length > 1
      ? `Two other pieces of that work map onto this role. I ${asClause(bestBullets[1])}${bestBullets[2] ? ` And I ${asClause(bestBullets[2])}` : ""}`
      : "",

    `I would welcome the chance to talk through how this applies to what your team is building. My resume is below${profile.githubUrl ? `, and my code is at ${profile.githubUrl}` : ""}.`,

    `Thank you for your time,\n${profile.fullName}\n${profile.email}${profile.phone ? ` · ${profile.phone}` : ""}`,
  ];

  return paragraphs.filter(Boolean).join("\n\n");
}

/**
 * Resume bullets start with a past-tense verb ("Built a pipeline…"), which reads
 * correctly after an explicit "I" once the leading capital is dropped.
 */
function asClause(bullet: string): string {
  const trimmed = bullet.trim();
  const body = trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
  return body.endsWith(".") ? body : `${body}.`;
}

interface LlmTailoring {
  summary: string;
  coverLetter: string;
  bullets: Record<string, string[]>;
  notes: string[];
}

function validateTailoring(value: unknown): LlmTailoring | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.coverLetter !== "string" || record.coverLetter.length < 200) return null;

  const bullets: Record<string, string[]> = {};
  if (typeof record.bullets === "object" && record.bullets !== null) {
    for (const [key, list] of Object.entries(record.bullets as Record<string, unknown>)) {
      if (Array.isArray(list)) {
        bullets[key] = list.filter((item): item is string => typeof item === "string").slice(0, 5);
      }
    }
  }

  return {
    summary: typeof record.summary === "string" ? record.summary : "",
    coverLetter: record.coverLetter,
    bullets,
    notes: Array.isArray(record.notes)
      ? record.notes.filter((item): item is string => typeof item === "string").slice(0, 6)
      : [],
  };
}

const TAILOR_SYSTEM = `You tailor an existing resume and write a cover letter for one specific job posting.
Hard rules:
- Never invent employers, titles, dates, degrees, metrics, or technologies. You may only reorder, trim, and rephrase what the candidate gave you.
- Rephrasing must preserve the original numbers exactly.
- Lead bullets with outcome and magnitude, then the method.
- The cover letter is 200-320 words, plain prose, no bullet lists, no "I am writing to express my interest", no flattery about the company's mission. Reference at least two concrete things from the candidate's actual history.
Reply with JSON only:
{"summary": string, "bullets": {"<experienceId>": [string]}, "coverLetter": string, "notes": [string]}
"summary" is a 2-sentence resume summary aimed at this posting. "bullets" maps each experience id to at most 4 chosen and rephrased bullets. "notes" explains in 2-4 short items what you emphasized and why.`;

function tailorPrompt(job: Job, profile: Profile, resume: Resume): string {
  const experience = resume.experience
    .map(
      (role) =>
        `id: ${role.id}\n${role.role} at ${role.company} (${role.start} to ${role.end})\nStack: ${role.stack.join(", ")}\nBullets:\n${role.bullets.map((bullet) => `  - ${bullet}`).join("\n")}`,
    )
    .join("\n\n");

  return `CANDIDATE
${profile.fullName} · ${profile.email}${profile.phone ? ` · ${profile.phone}` : ""}
${profile.location} · prefers ${profile.remotePreference}
GitHub: ${profile.githubUrl || "n/a"} · LinkedIn: ${profile.linkedinUrl || "n/a"}
Headline: ${profile.headline}
Skills: ${profile.skills.join(", ")}

EXPERIENCE (use these ids verbatim as keys in "bullets")
${experience}

PROJECTS
${resume.projects.map((project) => `- ${project.name}: ${project.description}`).join("\n") || "none"}

EDUCATION
${resume.education.map((entry) => `- ${entry.degree}, ${entry.school} (${entry.end})`).join("\n") || "none"}

TARGET POSTING
${job.title} at ${job.company} — ${job.location}${job.remote ? " (remote)" : ""}
Compensation: ${job.salaryText ?? "not posted"}
${job.description.slice(0, 4500)}`;
}

export async function tailorApplication(
  job: Job,
  profile: Profile,
  resume: Resume,
): Promise<TailoredApplication> {
  const overlap = matchedSkills(resume, profile, job);
  const heuristicBullets = selectBullets(resume, job);

  if (isLlmConfigured()) {
    const llm = await chatJson<LlmTailoring>(
      { system: TAILOR_SYSTEM, user: tailorPrompt(job, profile, resume), maxTokens: 2200, temperature: 0.4 },
      validateTailoring,
    );

    if (llm) {
      const knownIds = new Set(resume.experience.map((role) => role.id));
      const bullets: Record<string, string[]> = { ...heuristicBullets };
      for (const [id, list] of Object.entries(llm.bullets)) {
        if (knownIds.has(id) && list.length > 0) bullets[id] = list;
      }

      return {
        resumeMarkdown: renderResumeMarkdown(resume, {
          summary: llm.summary || heuristicSummary(job, profile, overlap),
          bulletsByExperienceId: bullets,
          prioritySkills: overlap,
          targetTitle: job.title,
        }),
        coverLetter: llm.coverLetter,
        notes: llm.notes.length > 0 ? llm.notes : defaultNotes(overlap, bullets),
      };
    }
  }

  return {
    resumeMarkdown: renderResumeMarkdown(resume, {
      summary: heuristicSummary(job, profile, overlap),
      bulletsByExperienceId: heuristicBullets,
      prioritySkills: overlap,
      targetTitle: job.title,
    }),
    coverLetter: heuristicCoverLetter(job, profile, resume, heuristicBullets, overlap),
    notes: defaultNotes(overlap, heuristicBullets),
  };
}

function defaultNotes(overlap: string[], bullets: Record<string, string[]>): string[] {
  const kept = Object.values(bullets).reduce((total, list) => total + list.length, 0);
  return [
    overlap.length > 0
      ? `Promoted ${overlap.slice(0, 6).join(", ")} to the top of the skills section to match the posting's stated stack.`
      : "No named technology overlap found, so the resume kept its default skill ordering.",
    `Kept the ${kept} most relevant bullets and dropped the rest to hold the resume to a skimmable length.`,
    "Retitled the resume header to the exact posting title so keyword screens match.",
  ];
}
