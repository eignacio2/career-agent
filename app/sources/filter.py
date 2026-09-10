"""Title-only pre-filter for AI engineering and forward deployed roles."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.models import JobRole, SourceJob

AI_ENGINEERING_TITLES = [
    re.compile(r"\ba\.?i\.?\s*[/&-]?\s*(engineer|developer|architect|scientist)\b", re.I),
    re.compile(r"\b(ml|machine[\s-]learning)\s*[/&-]?\s*(engineer|scientist|architect|researcher)\b", re.I),
    re.compile(r"\bllm\s*[/&-]?\s*(engineer|developer|scientist|architect)\b", re.I),
    re.compile(r"\b(gen\s?ai|generative\s+ai)\b", re.I),
    re.compile(r"\bmlops\b", re.I),
    re.compile(r"\bml\s+(platform|infrastructure|ops)\b", re.I),
    re.compile(r"\bnlp\s+(engineer|scientist)\b", re.I),
    re.compile(r"\bcomputer\s+vision\s+(engineer|scientist)\b", re.I),
    re.compile(r"\bdeep\s+learning\b", re.I),
    re.compile(r"\bprompt\s+engineer\b", re.I),
    re.compile(r"\bresearch\s+engineer\b", re.I),
    re.compile(r"\bapplied\s+ai\b", re.I),
    re.compile(
        r"\b(software|backend|platform)\s+engineer\b.*\b(ml|ai|machine\s+learning|inference|model)\b",
        re.I,
    ),
]

# Palantir-style embedding: software engineer sitting with the customer.
FORWARD_DEPLOYED_TITLES = [
    re.compile(r"\bforward[\s-]*deployed\b", re.I),
    re.compile(r"\bfde\b", re.I),
    re.compile(r"\bdeployment engineer\b", re.I),
    re.compile(r"\b(field|implementation)\s+(software\s+)?engineer\b", re.I),
    re.compile(r"\bcustomer engineer\b", re.I),
    re.compile(r"\b(technical\s+)?solutions engineer\b", re.I),
    re.compile(r"\bai\s+deployment\b", re.I),
]

DATA_SCIENCE_TITLES = [
    re.compile(r"\bdata\s+scien(ce|tist)\b", re.I),
    re.compile(r"\b(applied|research|decision|staff|principal|lead|senior|associate)\s+scientist\b", re.I),
    re.compile(r"\bstatistician\b", re.I),
    re.compile(r"\b(quantitative|quant)\s+(analyst|researcher|developer|scientist)\b", re.I),
]

EARLY_CAREER_TITLES = [
    re.compile(r"\b(new\s?grad(uate)?|university\s+grad(uate)?|college\s+grad(uate)?|recent\s+grad(uate)?)\b", re.I),
    re.compile(r"\b(early\s+career|entry[\s-]level|graduate\s+(programme|program|scheme))\b", re.I),
    re.compile(r"\brotational\s+(analyst|program|programme)\b", re.I),
    re.compile(r"\b(analyst|engineer|scientist)\s+(i|1|one)\b", re.I),
]

SENIOR_ONLY_TITLES = [
    re.compile(r"\b(staff|principal|distinguished|fellow)\b", re.I),
    re.compile(r"\b(director|head\s+of|vp|vice\s+president|chief)\b", re.I),
]

ADJACENT_TITLES = [
    re.compile(r"\bdata\s+engineer\b", re.I),
    re.compile(r"\banalytics\s+engineer\b", re.I),
    re.compile(r"\bdata\s+analyst\b", re.I),
    re.compile(r"\bsoftware\s+engineer\b", re.I),
]

HARD_REJECT_TITLES = [
    re.compile(
        r"\b(sales|account\s+executive|business\s+development|recruit(er|ing)|"
        r"customer\s+(success|support)|support\s+(specialist|engineer|agent)|"
        r"office\s+(assistant|manager)|executive\s+assistant)\b",
        re.I,
    ),
    re.compile(
        r"\b(designer|copywriter|content\s+writer|social\s+media|"
        r"marketing\s+(manager|specialist))\b",
        re.I,
    ),
    re.compile(
        r"\b(teacher|tutor|nurse|driver|warehouse|technician|labeling|annotator|annotation)\b",
        re.I,
    ),
]

INTERNSHIP_TITLES = re.compile(
    r"\b(intern|internship|co[\s-]?op|apprentice(ship)?|summer\s+analyst)\b",
    re.I,
)

# Only these families are what this search is for.
TARGET_ROLES = {"ai-engineering", "forward-deployed"}


@dataclass(frozen=True)
class TitleAssessment:
    role: JobRole
    early_career: bool
    senior_only: bool
    internship: bool


def _is_fde(title: str) -> bool:
    return any(pattern.search(title) for pattern in FORWARD_DEPLOYED_TITLES)


def assess_job_title(title: str) -> TitleAssessment | None:
    normalized = title.lower()
    # FDE titles sometimes mention "Customer Success" as the team. That is not
    # a customer-success IC role, so skip the hard reject when FDE matches.
    if not _is_fde(normalized) and any(pattern.search(normalized) for pattern in HARD_REJECT_TITLES):
        return None

    early_career = any(pattern.search(normalized) for pattern in EARLY_CAREER_TITLES)
    senior_only = any(pattern.search(normalized) for pattern in SENIOR_ONLY_TITLES)
    internship = bool(INTERNSHIP_TITLES.search(normalized))

    role: JobRole | None = None
    if _is_fde(normalized):
        role = "forward-deployed"
    elif any(pattern.search(normalized) for pattern in AI_ENGINEERING_TITLES):
        role = "ai-engineering"
    elif any(pattern.search(normalized) for pattern in DATA_SCIENCE_TITLES):
        role = "data-science"
    elif any(pattern.search(normalized) for pattern in ADJACENT_TITLES):
        role = "adjacent"
    elif early_career:
        role = "adjacent"

    if role is None:
        return None
    return TitleAssessment(
        role=role,
        early_career=early_career,
        senior_only=senior_only,
        internship=internship,
    )


def classify_role(job: SourceJob) -> JobRole:
    assessment = assess_job_title(job.title)
    return assessment.role if assessment else "adjacent"


def is_plausible_target(job: SourceJob, include_internships: bool = False) -> bool:
    assessment = assess_job_title(job.title)
    if assessment is None:
        return False
    if assessment.internship and not include_internships:
        return False
    return assessment.role in TARGET_ROLES
