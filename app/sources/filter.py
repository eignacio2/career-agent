"""Title-only pre-filter.

Classification (`assess_job_title`) still labels a posting's family. The
allowlist is the candidate's `target_titles`: a posting is kept if the title
text matches one of those phrases, or if it is in the same well-defined family
(AI engineering, forward deployed, data science) as a target. Adjacent titles
such as generic Software Engineer match by phrase only, so a SWE search does
not pull in every analyst programme.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
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

# Families that are specific enough to expand: listing "AI Engineer" also
# keeps "Prompt Engineer" / "MLOps Engineer". Adjacent is not in this set.
EXPANDABLE_FAMILIES: set[JobRole] = {"ai-engineering", "forward-deployed", "data-science"}

# Expand these before phrase matching so "ML Engineer" hits "Machine Learning Engineer".
TITLE_ABBREVIATIONS = {
    "ml": "machine learning",
    "mle": "machine learning engineer",
    "fde": "forward deployed engineer",
    "swe": "software engineer",
}


@dataclass(frozen=True)
class TitleAssessment:
    role: JobRole
    early_career: bool
    senior_only: bool
    internship: bool


NON_IC = re.compile(r"\b(product|program|project)\s+manager\b", re.I)


def _is_fde(title: str) -> bool:
    if not any(pattern.search(title) for pattern in FORWARD_DEPLOYED_TITLES):
        return False
    if NON_IC.search(title) and not re.search(r"\bengineer\b|\bfde\b", title, re.I):
        return False
    return True


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


def _normalize_title(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9+#. ]", " ", value.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def _expand_title_phrases(value: str) -> str:
    tokens: list[str] = []
    for token in _normalize_title(value).split(" "):
        if not token:
            continue
        tokens.extend(TITLE_ABBREVIATIONS.get(token, token).split(" "))
    return " ".join(tokens)


def title_matches_targets(job_title: str, target_titles: Iterable[str]) -> bool:
    """True when the posting title is the same role as one of the listed targets."""
    haystack = _expand_title_phrases(job_title)
    if not haystack:
        return False
    for raw in target_titles:
        needle = _expand_title_phrases(str(raw))
        if len(needle) < 3:
            continue
        if needle in haystack:
            return True
        # "AI Engineer" vs target "Associate AI Engineer": the job is the core phrase.
        if haystack in needle and len(haystack.split()) >= 2:
            return True
    return False


def families_from_targets(target_titles: Iterable[str]) -> set[JobRole]:
    families: set[JobRole] = set()
    for raw in target_titles:
        title = str(raw).strip()
        if not title:
            continue
        assessment = assess_job_title(title)
        if assessment:
            families.add(assessment.role)
    return families


def is_plausible_target(
    job: SourceJob,
    target_titles: Iterable[str] = (),
    include_internships: bool = False,
) -> bool:
    titles = [str(item).strip() for item in target_titles if str(item).strip()]
    if not titles:
        return False
    if INTERNSHIP_TITLES.search(job.title or "") and not include_internships:
        return False
    if title_matches_targets(job.title, titles):
        return True
    assessment = assess_job_title(job.title)
    if assessment is None:
        return False
    wanted = families_from_targets(titles) & EXPANDABLE_FAMILIES
    return assessment.role in wanted
