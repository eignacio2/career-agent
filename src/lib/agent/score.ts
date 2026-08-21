import { chatJson, isLlmConfigured } from "../llm";
import { assessJobTitle } from "../sources";
import type { ExperienceLevel, Job, Profile, Resume, ScoredMatch } from "../types";

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

const SENIOR_SIGNALS = ["senior", "staff", "principal", "lead", "sr.", "sr ", " iii", " iv"];
const JUNIOR_SIGNALS = ["junior", "entry level", "entry-level", "graduate", "associate", "jr.", " i "];

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const YEARS_PATTERNS: RegExp[] = [
  // "3-5 years", "3 to 5 years"
  /(\d{1,2})\s*(?:[-–—]|to)\s*\d{1,2}\s*\+?\s*years?/gi,
  // "4+ years" — in a posting this is effectively always a requirement.
  /(\d{1,2})\s*\+\s*years?/gi,
  // "minimum of 4 years", "at least 3 years"
  /(?:minimum|at\s+least|min\.?|no\s+less\s+than)\s+(?:of\s+)?(\d{1,2})\s*\+?\s*years?/gi,
  // "3 years of relevant experience" — a bare number needs the experience anchor.
  /(\d{1,2})\s+years?(?:'|’)?(?:\s+of)?\s+(?:[a-z-]+\s+){0,3}?experience/gi,
  // "five years of experience"
  /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:or\s+more\s+)?years?(?:\s+of)?\s+(?:[a-z-]+\s+){0,3}?experience/gi,
];

/** Phrases where a year count describes history rather than a requirement. */
const NOT_A_REQUIREMENT = /\b(past|last|next|previous|recent|over\s+the|within\s+the|for\s+the)\s*$/i;

/**
 * Finds the lowest number of years a posting asks for. Descriptions often cite
 * several figures ("3+ years in Python, 5+ years overall"), and the lowest is
 * the one that actually gates an application.
 */
export function extractRequiredYears(description: string): number | null {
  const found: number[] = [];

  for (const pattern of YEARS_PATTERNS) {
    for (const match of description.matchAll(pattern)) {
      const raw = match[1]?.toLowerCase();
      if (!raw) continue;

      const value = WORD_NUMBERS[raw] ?? Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 20) continue;

      const index = match.index ?? 0;
      const before = description.slice(Math.max(0, index - 20), index);
      const after = description.slice(index + match[0].length, index + match[0].length + 6);
      if (NOT_A_REQUIREMENT.test(before) || /^\s*ago\b/i.test(after)) continue;

      found.push(value);
    }
  }

  return found.length > 0 ? Math.min(...found) : null;
}

interface LevelBand {
  /** Years of stated experience this candidate can credibly answer for. */
  tolerated: number;
  label: string;
}

const LEVEL_BANDS: Record<ExperienceLevel, LevelBand> = {
  "new-grad": { tolerated: 2, label: "a new graduate" },
  "early-career": { tolerated: 4, label: "early career" },
  mid: { tolerated: 8, label: "mid level" },
  senior: { tolerated: 30, label: "senior" },
};

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
      return { points: 30, note: `Title is an exact match for a target role (${target}).` };
    }
    if (title.includes(normalized)) {
      return { points: 26, note: `Title contains your target role "${target}".` };
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
    return { points: 12, note: `Title only partially overlaps your targets (${overlap.join(", ")}).` };
  }
  if (overlap.length === 1) {
    return { points: 5, note: `Loose title overlap on "${overlap[0]}" alone.` };
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
    return { points: 11, matched, missing };
  }

  // A long posting can name twenty technologies and no real candidate covers all
  // of them, so a raw ratio would cap every score in the sixties. Treat 60%
  // coverage as full marks, and credit a high absolute count on its own.
  const ratio = matched.length / required.length;
  const fromRatio = Math.min(1, ratio / 0.6) * 24;
  const fromCount = Math.min(1, matched.length / 8) * 20;

  return { points: Math.round(Math.max(fromRatio, fromCount)), matched, missing };
}

const MAX_LEVEL_POINTS = 22;

interface LevelFit {
  points: number;
  note: string;
  gap: string | null;
  /**
   * Ceiling on the final score. Level mismatch is not a matter of degree that
   * strong skills can offset — a posting that wants five years will screen a new
   * graduate out before a human reads the resume. Capping keeps these postings
   * visible and ranked while ensuring they never reach the apply threshold.
   */
  cap: number | null;
}

/**
 * Scores how well the posting's level matches the candidate's, combining the
 * title's seniority signals with the years of experience the description
 * demands. For anyone early in their career this is the most predictive signal
 * available.
 */
function levelFit(job: Job, profile: Profile): LevelFit {
  const assessment = assessJobTitle(job.title);
  const band = LEVEL_BANDS[profile.experienceLevel] ?? LEVEL_BANDS.mid;
  const tolerated = profile.maxYearsRequired ?? band.tolerated;
  const title = job.title.toLowerCase();
  const isEarlyCareerCandidate =
    profile.experienceLevel === "new-grad" || profile.experienceLevel === "early-career";

  if (assessment?.seniorOnly && isEarlyCareerCandidate) {
    return {
      points: 0,
      note: `Staff-level or management scope, which is out of reach for ${band.label}.`,
      gap: "Requires staff-level or management experience.",
      cap: 25,
    };
  }

  let points: number;
  let note: string;
  let cap: number | null = null;

  if (job.earlyCareer || assessment?.earlyCareer || JUNIOR_SIGNALS.some((signal) => title.includes(signal))) {
    points = isEarlyCareerCandidate ? MAX_LEVEL_POINTS : 3;
    note = isEarlyCareerCandidate
      ? "Explicitly an early-career or new-grad opening, which is exactly the right level."
      : `Scoped below ${profile.yearsExperience} years of experience.`;
  } else if (SENIOR_SIGNALS.some((signal) => title.includes(signal))) {
    points = isEarlyCareerCandidate ? 2 : 20;
    note = isEarlyCareerCandidate
      ? `Titled as a senior role, which is not a realistic application for ${band.label}.`
      : `Senior scope fits ${profile.yearsExperience} years of experience.`;
    if (isEarlyCareerCandidate) cap = 45;
  } else {
    points = isEarlyCareerCandidate ? 13 : 16;
    note = isEarlyCareerCandidate
      ? "Untitled level, so it may be open to strong early-career candidates."
      : "Mid-level scope, a reasonable fit.";
  }

  const required = extractRequiredYears(job.description);
  if (required === null) {
    return { points, note, gap: null, cap };
  }

  if (required > tolerated) {
    const excess = required - tolerated;
    return {
      points: Math.min(points, 3),
      note: `The posting asks for ${required}+ years of experience, above the ${tolerated} you set as your ceiling.`,
      gap: `Asks for ${required}+ years of experience.`,
      cap: Math.max(15, 45 - excess * 8),
    };
  }

  return {
    points: Math.min(MAX_LEVEL_POINTS, points + 3),
    note: `${note} The posting asks for ${required === 0 ? "no prior" : `${required}+`} years of experience, which you clear.`,
    gap: null,
    cap,
  };
}

const NON_US_MARKERS =
  /\b(united kingdom|england|scotland|london|manchester|edinburgh|germany|berlin|munich|stuttgart|hamburg|france|paris|spain|madrid|barcelona|netherlands|amsterdam|ireland|dublin|poland|warsaw|krakow|india|bangalore|bengaluru|hyderabad|mumbai|pune|singapore|australia|sydney|melbourne|canada|toronto|vancouver|montreal|japan|tokyo|brazil|s[aã]o paulo|mexico city|israel|tel aviv|switzerland|zurich|geneva|sweden|stockholm|denmark|copenhagen|italy|milan|rome|portugal|lisbon|porto|romania|bucharest|czech|prague|austria|vienna|belgium|brussels|norway|oslo|finland|helsinki|china|beijing|shanghai|shenzhen|korea|seoul|hong kong|taiwan|taipei|dubai|abu dhabi|u\.?a\.?e\.?|south africa|new zealand|auckland|argentina|chile|colombia|bogot[aá]|philippines|manila|vietnam|hanoi|thailand|bangkok|indonesia|jakarta|malaysia|kuala lumpur|turkey|istanbul|egypt|cairo|nigeria|lagos|kenya|nairobi)\b/i;

/**
 * True when the candidate is targeting one country and the posting sits in
 * another. Relocating within a country is a normal ask for a first job; needing
 * a work visa is a different category of obstacle and usually disqualifying.
 */
function requiresForeignAuthorization(job: Job, profile: Profile): string | null {
  if (job.remote) return null;

  const targetsAbroad = profile.targetLocations.some((location) => NON_US_MARKERS.test(location));
  if (targetsAbroad) return null;

  const match = job.location.match(NON_US_MARKERS);
  return match ? match[0] : null;
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
  const level = levelFit(job, profile);
  const location = locationFit(job, profile);
  const salary = salaryFit(job, profile);
  // The search is specifically for data science and AI engineering work, so an
  // adjacent role has to be strong everywhere else to compete.
  const familyAdjustment = job.roleFamily === "adjacent" ? -14 : 6;

  const raw =
    title.points + skills.points + level.points + location.points + salary.points + familyAdjustment;

  const foreign = requiresForeignAuthorization(job, profile);
  const caps = [level.cap, foreign ? 50 : null].filter((value): value is number => value !== null);
  const ceiling = caps.length > 0 ? Math.min(...caps) : 100;
  const score = Math.max(0, Math.min(ceiling, Math.min(100, raw)));

  const reasons = [level.note, title.note, location.note];
  if (skills.matched.length > 0) {
    reasons.push(
      `You cover ${skills.matched.length} of ${skills.matched.length + skills.missing.length} named technologies (${skills.matched.slice(0, 6).join(", ")}).`,
    );
  }
  if (salary.note) reasons.push(salary.note);

  const gaps = [...(level.gap ? [level.gap] : []), ...skills.missing.slice(0, 7)];
  if (foreign) {
    const label = foreign.charAt(0).toUpperCase() + foreign.slice(1);
    gaps.unshift(`Based in ${label}, so it would need work authorization you may not hold.`);
    reasons.push(`This role is on-site in ${job.location}, outside the countries you are targeting.`);
  }
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
Weigh: title and scope alignment, overlap between the candidate's demonstrated work and the posting's requirements, level fit, location and remote fit, and compensation floor.

Level fit matters more than anything else and you must not be generous about it. If the posting demands more years of experience than the candidate has room for, score it below 40 no matter how well the skills line up, and say so in "gaps". A candidate who is a new graduate should score highly on roles explicitly labelled new-grad, entry-level, associate, or "I", and poorly on anything senior, staff, principal, or management. Do not reward a posting for sounding prestigious.

Reply with JSON only:
{"score": number, "verdict": string, "reasons": [string], "gaps": [string]}
"reasons" holds 2-4 specific, evidence-based sentences. "gaps" holds concrete missing requirements, including any experience-years shortfall.`;

const LEVEL_DESCRIPTIONS: Record<ExperienceLevel, string> = {
  "new-grad":
    "A new graduate with no full-time professional experience. Internships, research assistantships, and course projects are their entire track record.",
  "early-career": "One to three years of full-time professional experience.",
  mid: "Roughly four to seven years of full-time professional experience.",
  senior: "Eight or more years of full-time professional experience.",
};

function scoringPrompt(job: Job, profile: Profile, resume: Resume): string {
  const highlights = resume.experience
    .slice(0, 3)
    .map(
      (role) =>
        `- ${role.role} at ${role.company} (${role.start} to ${role.end}): ${role.bullets.slice(0, 3).join(" ")}`,
    )
    .join("\n");

  const tolerated = profile.maxYearsRequired ?? LEVEL_BANDS[profile.experienceLevel].tolerated;
  const required = extractRequiredYears(job.description);

  return `CANDIDATE
Name: ${profile.fullName}
Headline: ${profile.headline}
Career stage: ${profile.experienceLevel} — ${LEVEL_DESCRIPTIONS[profile.experienceLevel]}
Years of full-time experience: ${profile.yearsExperience}
Hard ceiling on experience demanded by a posting: ${tolerated} years
Location: ${profile.location} (prefers ${profile.remotePreference})
Compensation floor: ${profile.minSalary ? `$${profile.minSalary.toLocaleString()}` : "not specified"}
Target titles: ${profile.targetTitles.join(", ")}
Skills: ${profile.skills.join(", ")}

EXPERIENCE (this is the candidate's entire history — do not assume more)
${highlights}

EDUCATION
${resume.education.map((entry) => `- ${entry.degree}, ${entry.school} (${entry.end})`).join("\n") || "none listed"}

POSTING
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}${job.remote ? " (remote)" : ""}
Compensation: ${job.salaryText ?? "not posted"}
Years of experience this posting appears to require: ${required === null ? "not stated" : `${required}+`}
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
