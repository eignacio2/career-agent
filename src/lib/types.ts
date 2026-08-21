export type RemotePreference = "remote" | "hybrid" | "onsite" | "any";

export interface Profile {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  summary: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  yearsExperience: number;
  skills: string[];
  targetTitles: string[];
  targetLocations: string[];
  remotePreference: RemotePreference;
  minSalary: number | null;
  excludedCompanies: string[];
  requiredKeywords: string[];
  excludedKeywords: string[];
  autoApplyThreshold: number;
  dailyApplicationCap: number;
  autopilotEnabled: boolean;
  digestEmail: string;
  digestHourUtc: number;
  updatedAt: string;
}

export interface ResumeBasics {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  links: { label: string; url: string }[];
  summary: string;
}

export interface ResumeExperience {
  id: string;
  company: string;
  role: string;
  location: string;
  start: string;
  end: string;
  bullets: string[];
  stack: string[];
}

export interface ResumeProject {
  id: string;
  name: string;
  url: string;
  description: string;
  stack: string[];
}

export interface ResumeEducation {
  id: string;
  school: string;
  degree: string;
  start: string;
  end: string;
  detail: string;
}

export interface ResumeSkillGroup {
  id: string;
  label: string;
  items: string[];
}

export interface Resume {
  basics: ResumeBasics;
  skillGroups: ResumeSkillGroup[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  education: ResumeEducation[];
  certifications: string[];
}

export type JobStatus =
  | "new"
  | "shortlisted"
  | "queued"
  | "applied"
  | "skipped"
  | "expired";

export type JobRole = "data-science" | "ai-engineering" | "adjacent";

export interface Job {
  id: number;
  source: string;
  sourceId: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  url: string;
  applyEmail: string | null;
  description: string;
  salaryText: string | null;
  tags: string[];
  roleFamily: JobRole;
  postedAt: string | null;
  discoveredAt: string;
  score: number | null;
  scoreVerdict: string | null;
  scoreReasons: string[];
  scoreGaps: string[];
  status: JobStatus;
  decidedAt: string | null;
  runId: number | null;
}

export type ApplicationStatus =
  | "prepared"
  | "awaiting_review"
  | "submitted"
  | "needs_manual_submit"
  | "failed"
  | "interviewing"
  | "rejected"
  | "offer"
  | "withdrawn";

export type ApplicationChannel = "email" | "external_form";

export interface Application {
  id: number;
  jobId: number;
  status: ApplicationStatus;
  channel: ApplicationChannel;
  resumeMarkdown: string;
  coverLetter: string;
  tailoringNotes: string[];
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  notes: string;
  runId: number | null;
  job?: Job;
}

export type DigestStatus = "outbox" | "sent" | "failed";

export interface Digest {
  id: number;
  runDate: string;
  subject: string;
  html: string;
  text: string;
  toEmail: string;
  status: DigestStatus;
  transport: string;
  sentAt: string | null;
  error: string | null;
  stats: DigestStats;
  createdAt: string;
}

export interface DigestStats {
  discovered: number;
  scored: number;
  submitted: number;
  awaitingReview: number;
  skipped: number;
  topScore: number;
}

export type RunStatus = "running" | "success" | "failed";

export interface AgentRun {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  trigger: string;
  stats: DigestStats;
  log: RunLogEntry[];
  error: string | null;
}

export interface RunLogEntry {
  at: string;
  step: string;
  message: string;
  level: "info" | "warn" | "error";
}

export interface LinkedInPack {
  id: number;
  headline: string;
  about: string;
  skills: string[];
  experienceRewrites: { company: string; role: string; bullets: string[] }[];
  openToWork: string;
  rationale: string[];
  generatedBy: string;
  createdAt: string;
}

export interface ScoredMatch {
  score: number;
  verdict: string;
  reasons: string[];
  gaps: string[];
}

export interface TailoredApplication {
  resumeMarkdown: string;
  coverLetter: string;
  notes: string[];
}
