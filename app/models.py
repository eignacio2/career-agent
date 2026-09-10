"""Domain types.

These are the same shapes the TypeScript v1 used, minus the surfaces this
slice does not implement (applications, digests, LinkedIn packs). Pydantic
validates them on the way in so a malformed JSON profile cannot silently
become a scoring bug.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

RemotePreference = Literal["remote", "hybrid", "onsite", "any"]
ExperienceLevel = Literal["new-grad", "early-career", "mid", "senior"]
JobRole = Literal["data-science", "ai-engineering", "adjacent"]
JobStatus = Literal["new", "shortlisted", "queued", "skipped", "expired"]
RunStatus = Literal["running", "success", "failed"]
LogLevel = Literal["info", "warn", "error"]


class ResumeSkillGroup(BaseModel):
    id: str
    label: str
    items: list[str] = Field(default_factory=list)


class ResumeExperience(BaseModel):
    id: str
    company: str
    role: str
    location: str = ""
    start: str = ""
    end: str = ""
    bullets: list[str] = Field(default_factory=list)
    stack: list[str] = Field(default_factory=list)


class ResumeEducation(BaseModel):
    id: str
    school: str
    degree: str
    start: str = ""
    end: str = ""
    detail: str = ""


class ResumeProject(BaseModel):
    id: str
    name: str
    url: str = ""
    description: str = ""
    stack: list[str] = Field(default_factory=list)


class ResumeBasics(BaseModel):
    name: str
    title: str
    email: str
    phone: str = ""
    location: str = ""
    links: list[dict[str, str]] = Field(default_factory=list)
    summary: str = ""


class Resume(BaseModel):
    basics: ResumeBasics
    skill_groups: list[ResumeSkillGroup] = Field(default_factory=list)
    experience: list[ResumeExperience] = Field(default_factory=list)
    projects: list[ResumeProject] = Field(default_factory=list)
    education: list[ResumeEducation] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)


class Profile(BaseModel):
    full_name: str
    email: str
    phone: str = ""
    location: str = ""
    headline: str = ""
    summary: str = ""
    linkedin_url: str = ""
    github_url: str = ""
    portfolio_url: str = ""
    years_experience: int = 0
    experience_level: ExperienceLevel = "new-grad"
    max_years_required: int | None = 2
    include_internships: bool = False
    skills: list[str] = Field(default_factory=list)
    target_titles: list[str] = Field(default_factory=list)
    target_locations: list[str] = Field(default_factory=list)
    remote_preference: RemotePreference = "any"
    min_salary: int | None = None
    excluded_companies: list[str] = Field(default_factory=list)
    required_keywords: list[str] = Field(default_factory=list)
    excluded_keywords: list[str] = Field(default_factory=list)
    auto_apply_threshold: int = 72
    daily_application_cap: int = 10


class SourceJob(BaseModel):
    """A posting as a board returned it — not yet stored, not yet scored."""

    source: str
    source_id: str
    title: str
    company: str
    location: str = ""
    remote: bool = False
    url: str
    apply_email: str | None = None
    description: str = ""
    salary_text: str | None = None
    tags: list[str] = Field(default_factory=list)
    posted_at: str | None = None
    early_career: bool = False


class ScoredMatch(BaseModel):
    score: int
    verdict: str
    reasons: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)


class Job(BaseModel):
    """A posting after it has been stored. Score fields are None until scored."""

    id: int
    source: str
    source_id: str
    title: str
    company: str
    location: str
    remote: bool
    url: str
    apply_email: str | None
    description: str
    salary_text: str | None
    tags: list[str]
    role_family: JobRole
    early_career: bool
    posted_at: str | None
    discovered_at: str
    score: int | None
    score_verdict: str | None
    score_reasons: list[str]
    score_gaps: list[str]
    status: JobStatus
    decided_at: str | None
    run_id: int | None


class RunLogEntry(BaseModel):
    at: str
    step: str
    message: str
    level: LogLevel = "info"


class RunStats(BaseModel):
    discovered: int = 0
    scored: int = 0
    queued: int = 0
    skipped: int = 0
    top_score: int = 0


class AgentRun(BaseModel):
    id: int
    started_at: str
    finished_at: str | None
    status: RunStatus
    trigger: str
    stats: RunStats
    log: list[RunLogEntry]
    error: str | None = None


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
