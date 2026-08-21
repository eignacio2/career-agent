import { chatJson, isLlmConfigured } from "../llm";
import type { Job, Profile, Resume, ScoredMatch } from "../types";

const SKILL_VOCABULARY = [
  "python","sql","r","scala","java","typescript","javascript","go","rust","bash",
  "pytorch","tensorflow","jax","keras","scikit-learn","xgboost","lightgbm","statsmodels",
  "pandas","numpy","polars","spark","dask","ray","hadoop","kafka","flink",
  "airflow","dagster","prefect","dbt","snowflake","bigquery","redshift","databricks",
  "postgres","mysql","mongodb","redis","elasticsearch","pgvector","pinecone","weaviate","qdrant","faiss",
  "aws","gcp","azure","sagemaker","vertex ai","docker","kubernetes","terraform","helm",
  "mlflow","weights & biases","kubeflow","feature store","seldon","bentoml",
  "langchain","llamaindex","openai","anthropic","hugging face","transformers","vllm",
  "rag","retrieval","embedding","fine-tuning","lora","peft","quantization","prompt engineering",
  "llm evaluation","guardrails","agents","tool calling","structured output",
  "nlp","computer vision","recommender","ranking","learning to rank","search relevance",
  "time series","forecasting","causal inference","a/b testing","experimentation","bayesian",
  "econometrics","survival analysis","clustering","anomaly detection","optimization",
  "fastapi","flask","django","grpc","rest api","graphql","node",
  "tableau","looker","power bi","streamlit","dash",
  "git","ci/cd","github actions","observability","opentelemetry","datadog",
];

const SENIOR_SIGNALS = ["senior", "staff", "principal", "lead", "sr.", "sr ", "iii", "iv"];
const JUNIOR_SIGNALS = ["junior", "entry level", "entry-level", "intern", "graduate", "associate", "jr."];
const MANAGER_SIGNALS = ["manager", "director", "head of", "vp ", "vice president"];

/**
 * Finds the technologies a posting names. `extraVocabulary` lets the caller add
 * the candidate's own listed skills, so credit is given for anything they claim
 * even when it is absent from the built-in vocabulary.
 */
export function extractJobSkills(
  job: Pick<Job, "title" | "description" | "tags">,
  extraVocabulary: string[] = [],
): string[] {
  const haystack = `${job.title} ${job.tags.join(" ")} ${job.description}`.toLowerCase();
  const vocabulary = new Set([
    ...SKILL_VOCABULARY,
    ...extraVocabulary.map((skill) => skill.toLowerCase().trim()).filter((skill) => skill.length > 2),
  ]);
  return [...vocabulary].filter((skill) => haystack.includes(skill));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#. ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Words that describe level rather than role; scored separately by seniorityFit. */
const LEVEL_WORDS = new Set([
  "senior","staff","principal","lead","junior","associate","entry","sr","jr","ii","iii","iv","level","independent",
]);

function titleAlignment(job: Job, profile: Profile): { points: number; note: string } {
  const title = normalize(job.title);
  for (const target of profile.targetTitles) {
    const normalized = normalize(target);
    if (!normalized) continue;
    if (title === normalized) {
      return { points: 34, note: `Title is an exact match for a target role (${target}).` };
    }
    if (title.includes(normalized)) {
      return { points: 30, note: `Title contains your target role "${target}".` };
    }
  }

  const targetWords = new Set(
    profile.targetTitles
      .flatMap((target) => normalize(target).split(" "))
      .filter((word) => word.length > 2 && !LEVEL_WORDS.has(word)),
  );
  const overlap = [...new Set(title.split(" "))].filter(
    (word) => targetWords.has(word) && !LEVEL_WORDS.has(word),
  );

  if (overlap.length >= 2) {
    return { points: 14, note: `Title only partially overlaps your targets (${overlap.join(", ")}).` };
  }
  if (overlap.length === 1) {
    return { points: 6, note: `Loose title overlap on "${overlap[0]}" alone.` };
  }
  return { points: 0, note: "Title does not line up with any of your target roles." };
}

function skillCoverage(
  job: Job,
  profile: Profile,
  resume: Resume,
): { points: number; matched: string[]; missing: string[] } {
  const owned = new Set(
    [
      ...profile.skills,
      ...resume.skillGroups.flatMap((group) => group.items),
      ...resume.experience.flatMap((role) => role.stack),
    ].map(normalize),
  );

  const required = extractJobSkills(job, [...owned]);
  const matched = required.filter((skill) => owned.has(normalize(skill)));
  const missing = required.filter((skill) => !owned.has(normalize(skill)));

  // Some postings describe the work without naming a stack. There is nothing to
  // measure there, so score it neutrally rather than punishing the candidate for
  // the posting's vagueness.
  if (required.length < 4) {
    return { points: 13, matched, missing };
  }

  // A long posting can name twenty technologies and no real candidate covers all
  // of them, so a raw ratio would cap every score in the sixties. Treat 60%
  // coverage as full marks, and credit a high absolute count on its own.
  const ratio = matched.length / required.length;
  const fromRatio = Math.min(1, ratio / 0.6) * 28;
  const fromCount = Math.min(1, matched.length / 8) * 24;

  return { points: Math.round(Math.max(fromRatio, fromCount)), matched, missing };
}

function seniorityFit(job: Job, profile: Profile): { points: number; note: string } {
  const title = job.title.toLowerCase();
  const years = profile.yearsExperience;

  if (MANAGER_SIGNALS.some((signal) => title.includes(signal))) {
    return { points: 3, note: "Posting looks like a people-management role." };
  }
  if (JUNIOR_SIGNALS.some((signal) => title.includes(signal))) {
    return years >= 4
      ? { points: 1, note: `Scoped below your ${years} years of experience.` }
      : { points: 10, note: "Seniority matches an early-career profile." };
  }
  if (SENIOR_SIGNALS.some((signal) => title.includes(signal))) {
    return years >= 5
      ? { points: 12, note: `Senior scope fits ${years} years of experience.` }
      : { points: 6, note: `Senior title may stretch ${years} years of experience.` };
  }
  return { points: 9, note: "Mid-level scope, a reasonable fit." };
}

function locationFit(job: Job, profile: Profile): { points: number; note: string } {
  const location = job.location.toLowerCase().trim();
  const wantsRemote = profile.remotePreference === "remote";

  if (job.remote || location.includes("remote") || location.includes("anywhere")) {
    if (wantsRemote || profile.remotePreference === "any") {
      return { points: 16, note: "Remote role, which matches your stated preference." };
    }
    return { points: 12, note: "Remote role." };
  }

  // An empty location field means the board did not say, not that the role is
  // on-site. Guessing either way would be wrong, so stay neutral and say so.
  if (location.length === 0) {
    return { points: 9, note: "The posting does not state a location, so this needs checking by hand." };
  }

  const matchedCity = profile.targetLocations.find((target) => {
    const city = normalize(target).split(",")[0].replace(/\(.*\)/, "").trim();
    return city.length > 2 && city !== "remote" && location.includes(city);
  });
  if (matchedCity) {
    return { points: 13, note: `Located in a target market (${matchedCity}).` };
  }
  if (wantsRemote) {
    return { points: 2, note: `On-site in ${job.location}, but you are looking for remote work.` };
  }
  return { points: 7, note: `On-site in ${job.location}.` };
}

function salaryFit(job: Job, profile: Profile): { points: number; note: string | null } {
  if (!profile.minSalary || !job.salaryText) return { points: 4, note: null };

  // Hourly contract rates are not comparable to an annual floor, so skip them.
  if (/\/\s*(hour|hr)\b|per hour/i.test(job.salaryText)) {
    return { points: 4, note: `Posted as an hourly rate (${job.salaryText}), not compared against your annual floor.` };
  }

  const numbers = [...job.salaryText.matchAll(/(\d[\d,]{3,})/g)]
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((value) => value >= 20_000 && value <= 1_500_000);
  if (numbers.length === 0) return { points: 4, note: null };

  const top = Math.max(...numbers);
  if (top >= profile.minSalary) {
    return { points: 6, note: `Posted range tops out at $${top.toLocaleString()}, above your floor.` };
  }
  return {
    points: 0,
    note: `Posted range tops out at $${top.toLocaleString()}, below your $${profile.minSalary.toLocaleString()} floor.`,
  };
}

function verdictFor(score: number): string {
  if (score >= 85) return "Strong match";
  if (score >= 75) return "Good match";
  if (score >= 60) return "Worth a look";
  if (score >= 40) return "Weak match";
  return "Not a fit";
}

export function scoreHeuristically(job: Job, profile: Profile, resume: Resume): ScoredMatch {
  const haystack = `${job.title} ${job.company} ${job.description}`.toLowerCase();

  const blockedCompany = profile.excludedCompanies.find(
    (company) => company.trim() && job.company.toLowerCase().includes(company.toLowerCase().trim()),
  );
  if (blockedCompany) {
    return {
      score: 0,
      verdict: "Excluded",
      reasons: [`${blockedCompany} is on your exclusion list.`],
      gaps: [],
    };
  }

  const blockedKeyword = profile.excludedKeywords.find(
    (keyword) => keyword.trim() && haystack.includes(keyword.toLowerCase().trim()),
  );
  if (blockedKeyword) {
    return {
      score: 0,
      verdict: "Excluded",
      reasons: [`Posting contains the excluded phrase "${blockedKeyword}".`],
      gaps: [],
    };
  }

  const missingRequired = profile.requiredKeywords.filter(
    (keyword) => keyword.trim() && !haystack.includes(keyword.toLowerCase().trim()),
  );
  if (missingRequired.length > 0) {
    return {
      score: 12,
      verdict: "Not a fit",
      reasons: [`Missing required keyword(s): ${missingRequired.join(", ")}.`],
      gaps: missingRequired,
    };
  }

  const title = titleAlignment(job, profile);
  const skills = skillCoverage(job, profile, resume);
  const seniority = seniorityFit(job, profile);
  const location = locationFit(job, profile);
  const salary = salaryFit(job, profile);
  // The search is specifically for data science and AI engineering work, so an
  // adjacent role has to be strong everywhere else to compete.
  const familyAdjustment = job.roleFamily === "adjacent" ? -8 : 6;

  const score = Math.max(
    0,
    Math.min(
      100,
      title.points + skills.points + seniority.points + location.points + salary.points + familyAdjustment,
    ),
  );

  const reasons = [title.note, seniority.note, location.note];
  if (skills.matched.length > 0) {
    reasons.push(
      `You cover ${skills.matched.length} of ${skills.matched.length + skills.missing.length} named technologies (${skills.matched.slice(0, 6).join(", ")}).`,
    );
  }
  if (salary.note) reasons.push(salary.note);

  const gaps = skills.missing.slice(0, 8);
  if (job.roleFamily === "adjacent") {
    gaps.push("Reads as adjacent work rather than a data science or AI engineering role.");
  }

  return { score, verdict: verdictFor(score), reasons, gaps };
}

function validateMatch(value: unknown): ScoredMatch | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const score = Number(record.score);
  if (!Number.isFinite(score)) return null;

  const toStrings = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === "string").slice(0, 8) : [];

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: clamped,
    verdict: typeof record.verdict === "string" && record.verdict ? record.verdict : verdictFor(clamped),
    reasons: toStrings(record.reasons),
    gaps: toStrings(record.gaps),
  };
}

const SCORING_SYSTEM = `You are a blunt technical recruiter screening data science and AI engineering roles for one candidate.
Score fit from 0-100. Be strict: 85+ means the candidate is clearly in the top slice of applicants, 60-74 means plausible but stretched, below 40 means do not apply.
Weigh: title and scope alignment, overlap between the candidate's demonstrated work and the posting's requirements, seniority, location and remote fit, and compensation floor.
Never inflate a score because the posting sounds prestigious. Reply with JSON only:
{"score": number, "verdict": string, "reasons": [string], "gaps": [string]}
"reasons" holds 2-4 specific, evidence-based sentences. "gaps" holds concrete missing requirements.`;

function scoringPrompt(job: Job, profile: Profile, resume: Resume): string {
  const highlights = resume.experience
    .slice(0, 3)
    .map(
      (role) =>
        `- ${role.role} at ${role.company} (${role.start} to ${role.end}): ${role.bullets.slice(0, 3).join(" ")}`,
    )
    .join("\n");

  return `CANDIDATE
Name: ${profile.fullName}
Headline: ${profile.headline}
Years of experience: ${profile.yearsExperience}
Location: ${profile.location} (prefers ${profile.remotePreference})
Compensation floor: ${profile.minSalary ? `$${profile.minSalary.toLocaleString()}` : "not specified"}
Target titles: ${profile.targetTitles.join(", ")}
Skills: ${profile.skills.join(", ")}

RECENT EXPERIENCE
${highlights}

POSTING
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}${job.remote ? " (remote)" : ""}
Compensation: ${job.salaryText ?? "not posted"}
Description:
${job.description.slice(0, 4500)}`;
}

export async function scoreJob(job: Job, profile: Profile, resume: Resume): Promise<ScoredMatch> {
  const heuristic = scoreHeuristically(job, profile, resume);

  // Hard exclusions are policy, not judgment: never let the model overrule them.
  if (heuristic.verdict === "Excluded" || !isLlmConfigured()) return heuristic;

  const llm = await chatJson<ScoredMatch>(
    { system: SCORING_SYSTEM, user: scoringPrompt(job, profile, resume), maxTokens: 700, temperature: 0.2 },
    validateMatch,
  );
  if (!llm) return heuristic;

  return {
    ...llm,
    reasons: llm.reasons.length > 0 ? llm.reasons : heuristic.reasons,
    gaps: llm.gaps.length > 0 ? llm.gaps : heuristic.gaps,
  };
}
