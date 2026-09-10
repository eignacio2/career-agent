"""Heuristic scoring for data science and AI engineering postings.

No language model in this slice. The TypeScript v1 optionally overlaid an LLM
score; that overlay was never allowed to override a hard exclusion. Keeping
the heuristic as the only scorer means tests can pin the numbers.

Weights (same as v1):
  title 30, skills 24, level 22, location 16, salary 6, family ±14

Level mismatch uses a *cap*, not a penalty. A penalty of -20 on a 90 still
clears a 72 apply threshold. A cap of 45 cannot.
"""

from __future__ import annotations

import re
from typing import Iterable

from app.models import ExperienceLevel, Job, Profile, Resume, ScoredMatch, SourceJob
from app.sources.filter import assess_job_title

SKILL_VOCABULARY = [
    "python", "sql", "r", "scala", "java", "typescript", "javascript", "go", "rust", "bash",
    "pytorch", "tensorflow", "jax", "keras", "scikit-learn", "xgboost", "lightgbm", "statsmodels",
    "pandas", "numpy", "polars", "spark", "dask", "ray", "hadoop", "kafka", "flink",
    "airflow", "dagster", "prefect", "dbt", "snowflake", "bigquery", "redshift", "databricks",
    "postgres", "mysql", "mongodb", "redis", "elasticsearch", "pgvector", "pinecone", "weaviate", "qdrant", "faiss",
    "aws", "gcp", "azure", "sagemaker", "vertex ai", "docker", "kubernetes", "terraform", "helm",
    "mlflow", "weights & biases", "kubeflow", "feature store", "seldon", "bentoml",
    "langchain", "llamaindex", "openai", "anthropic", "hugging face", "transformers", "vllm",
    "rag", "retrieval", "embedding", "fine-tuning", "lora", "peft", "quantization", "prompt engineering",
    "llm evaluation", "guardrails", "agents", "tool calling", "structured output",
    "nlp", "computer vision", "recommender", "ranking", "learning to rank", "search relevance",
    "time series", "forecasting", "causal inference", "a/b testing", "experimentation", "bayesian",
    "econometrics", "survival analysis", "clustering", "anomaly detection", "optimization",
    "fastapi", "flask", "django", "grpc", "rest api", "graphql", "node",
    "tableau", "looker", "power bi", "streamlit", "dash",
    "git", "ci/cd", "github actions", "observability", "opentelemetry", "datadog",
    "n8n", "gemini",
]

SENIOR_SIGNALS = ["senior", "staff", "principal", "lead", "sr.", "sr ", " iii", " iv"]
JUNIOR_SIGNALS = ["junior", "entry level", "entry-level", "graduate", "associate", "jr.", " i "]

WORD_NUMBERS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
}

# Compiled once. Flags match the TypeScript /gi patterns.
YEARS_PATTERNS = [
    # "3-5 years", "3 to 5 years"
    re.compile(r"(\d{1,2})\s*(?:[-–—]|to)\s*\d{1,2}\s*\+?\s*years?", re.I),
    # "4+ years" — in a posting this is effectively always a requirement.
    re.compile(r"(\d{1,2})\s*\+\s*years?", re.I),
    # "minimum of 4 years", "at least 3 years"
    re.compile(r"(?:minimum|at\s+least|min\.?|no\s+less\s+than)\s+(?:of\s+)?(\d{1,2})\s*\+?\s*years?", re.I),
    # "3 years of relevant experience" — a bare number needs the experience anchor.
    re.compile(r"(\d{1,2})\s+years?(?:'|’)?(?:\s+of)?\s+(?:[a-z-]+\s+){0,3}?experience", re.I),
    # "five years of experience"
    re.compile(
        r"\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:or\s+more\s+)?years?(?:\s+of)?\s+(?:[a-z-]+\s+){0,3}?experience",
        re.I,
    ),
]

# Phrases where a year count describes history rather than a requirement.
NOT_A_REQUIREMENT = re.compile(
    r"\b(past|last|next|previous|recent|over\s+the|within\s+the|for\s+the)\s*$",
    re.I,
)

LEVEL_BANDS: dict[ExperienceLevel, tuple[int, str]] = {
    "new-grad": (2, "a new graduate"),
    "early-career": (4, "early career"),
    "mid": (8, "mid level"),
    "senior": (30, "senior"),
}

LEVEL_WORDS = {
    "senior", "staff", "principal", "lead", "junior", "associate", "entry",
    "sr", "jr", "ii", "iii", "iv", "level", "independent",
}

MAX_LEVEL_POINTS = 22

NON_US_MARKERS = re.compile(
    r"\b(united kingdom|england|scotland|london|manchester|edinburgh|germany|berlin|"
    r"munich|stuttgart|hamburg|france|paris|spain|madrid|barcelona|netherlands|"
    r"amsterdam|ireland|dublin|poland|warsaw|krakow|india|bangalore|bengaluru|"
    r"hyderabad|mumbai|pune|singapore|australia|sydney|melbourne|canada|toronto|"
    r"vancouver|montreal|japan|tokyo|brazil|s[aã]o paulo|mexico city|israel|"
    r"tel aviv|switzerland|zurich|geneva|sweden|stockholm|denmark|copenhagen|"
    r"italy|milan|rome|portugal|lisbon|porto|romania|bucharest|czech|prague|"
    r"austria|vienna|belgium|brussels|norway|oslo|finland|helsinki|china|beijing|"
    r"shanghai|shenzhen|korea|seoul|hong kong|taiwan|taipei|dubai|abu dhabi|"
    r"u\.?a\.?e\.?|south africa|new zealand|auckland|argentina|chile|colombia|"
    r"bogot[aá]|philippines|manila|vietnam|hanoi|thailand|bangkok|indonesia|"
    r"jakarta|malaysia|kuala lumpur|turkey|istanbul|egypt|cairo|nigeria|lagos|"
    r"kenya|nairobi)\b",
    re.I,
)


def extract_required_years(description: str) -> int | None:
    """Lowest years-required figure in a posting, or None if none found.

    Postings often cite several figures ("3+ years in Python, 5+ years overall").
    The lowest one is the gate that actually decides whether to apply.
    """
    found: list[int] = []
    for pattern in YEARS_PATTERNS:
        for match in pattern.finditer(description):
            raw = (match.group(1) or "").lower()
            if not raw:
                continue
            value = WORD_NUMBERS.get(raw, None)
            if value is None:
                try:
                    value = int(raw)
                except ValueError:
                    continue
            if value < 0 or value > 20:
                continue

            index = match.start()
            before = description[max(0, index - 20) : index]
            after = description[match.end() : match.end() + 6]
            if NOT_A_REQUIREMENT.search(before) or re.match(r"\s*ago\b", after, re.I):
                continue
            found.append(value)
    return min(found) if found else None


def _skill_in_haystack(skill: str, haystack: str) -> bool:
    """One-letter skills like 'R' must not match the 'r' in 'route'."""
    if len(skill) <= 2:
        return re.search(rf"(?<![a-z0-9]){re.escape(skill)}(?![a-z0-9])", haystack) is not None
    return skill in haystack


def extract_job_skills(job: Job | SourceJob, extra_vocabulary: Iterable[str] = ()) -> list[str]:
    haystack = f"{job.title} {' '.join(job.tags)} {job.description}".lower()
    vocabulary = set(SKILL_VOCABULARY)
    for skill in extra_vocabulary:
        cleaned = skill.lower().strip()
        if len(cleaned) > 2:
            vocabulary.add(cleaned)
    return [skill for skill in vocabulary if _skill_in_haystack(skill, haystack)]


def _normalize(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9+#. ]", " ", value.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def _title_alignment(job: Job, profile: Profile) -> tuple[int, str]:
    title = _normalize(job.title)
    for target in profile.target_titles:
        normalized = _normalize(target)
        if not normalized:
            continue
        if title == normalized:
            return 30, f"Title is an exact match for a target role ({target})."
        if normalized in title:
            return 26, f'Title contains your target role "{target}".'

    target_words = {
        word
        for target in profile.target_titles
        for word in _normalize(target).split(" ")
        if len(word) > 2 and word not in LEVEL_WORDS
    }
    overlap = [
        word
        for word in dict.fromkeys(title.split(" "))
        if word in target_words and word not in LEVEL_WORDS
    ]
    if len(overlap) >= 2:
        return 12, f"Title only partially overlaps your targets ({', '.join(overlap)})."
    if len(overlap) == 1:
        return 5, f'Loose title overlap on "{overlap[0]}" alone.'
    return 0, "Title does not line up with any of your target roles."


def _skill_coverage(job: Job, profile: Profile, resume: Resume) -> tuple[int, list[str], list[str]]:
    owned = {
        _normalize(skill)
        for skill in [
            *profile.skills,
            *[item for group in resume.skill_groups for item in group.items],
            *[item for role in resume.experience for item in role.stack],
        ]
    }
    required = extract_job_skills(job, owned)
    matched = [skill for skill in required if _normalize(skill) in owned]
    missing = [skill for skill in required if _normalize(skill) not in owned]

    # Vague postings that name almost no stack should not punish the candidate.
    if len(required) < 4:
        return 11, matched, missing

    # 60% coverage is full marks; a high absolute count also counts.
    ratio = len(matched) / len(required)
    from_ratio = min(1.0, ratio / 0.6) * 24
    from_count = min(1.0, len(matched) / 8) * 20
    return round(max(from_ratio, from_count)), matched, missing


def _level_fit(job: Job, profile: Profile) -> tuple[int, str, str | None, int | None]:
    assessment = assess_job_title(job.title)
    tolerated_default, label = LEVEL_BANDS.get(profile.experience_level, LEVEL_BANDS["mid"])
    tolerated = profile.max_years_required if profile.max_years_required is not None else tolerated_default
    title = job.title.lower()
    is_early = profile.experience_level in ("new-grad", "early-career")

    if assessment and assessment.senior_only and is_early:
        return (
            0,
            f"Staff-level or management scope, which is out of reach for {label}.",
            "Requires staff-level or management experience.",
            25,
        )

    cap: int | None = None
    if (
        job.early_career
        or (assessment and assessment.early_career)
        or any(signal in title for signal in JUNIOR_SIGNALS)
    ):
        points = MAX_LEVEL_POINTS if is_early else 3
        note = (
            "Explicitly an early-career or new-grad opening, which is exactly the right level."
            if is_early
            else f"Scoped below {profile.years_experience} years of experience."
        )
    elif any(signal in title for signal in SENIOR_SIGNALS):
        points = 2 if is_early else 20
        note = (
            f"Titled as a senior role, which is not a realistic application for {label}."
            if is_early
            else f"Senior scope fits {profile.years_experience} years of experience."
        )
        if is_early:
            cap = 45
    else:
        points = 13 if is_early else 16
        note = (
            "Untitled level, so it may be open to strong early-career candidates."
            if is_early
            else "Mid-level scope, a reasonable fit."
        )

    required = extract_required_years(job.description)
    if required is None:
        return points, note, None, cap

    if required > tolerated:
        excess = required - tolerated
        return (
            min(points, 3),
            (
                f"The posting asks for {required}+ years of experience, "
                f"above the {tolerated} you set as your ceiling."
            ),
            f"Asks for {required}+ years of experience.",
            max(15, 45 - excess * 8),
        )

    years_label = "no prior" if required == 0 else f"{required}+"
    return (
        min(MAX_LEVEL_POINTS, points + 3),
        f"{note} The posting asks for {years_label} years of experience, which you clear.",
        None,
        cap,
    )


def _requires_foreign_authorization(job: Job, profile: Profile) -> str | None:
    if job.remote:
        return None
    if any(NON_US_MARKERS.search(location) for location in profile.target_locations):
        return None
    match = NON_US_MARKERS.search(job.location)
    return match.group(0) if match else None


def _location_fit(job: Job, profile: Profile) -> tuple[int, str]:
    location = job.location.lower().strip()
    wants_remote = profile.remote_preference == "remote"

    if job.remote or "remote" in location or "anywhere" in location:
        if wants_remote or profile.remote_preference == "any":
            return 16, "Remote role, which matches your stated preference."
        return 12, "Remote role."

    if not location:
        return 9, "The posting does not state a location, so this needs checking by hand."

    for target in profile.target_locations:
        city = re.sub(r"\(.*\)", "", _normalize(target).split(",")[0]).strip()
        if len(city) > 2 and city != "remote" and city in location:
            return 13, f"Located in a target market ({target})."

    if wants_remote:
        return 2, f"On-site in {job.location}, but you are looking for remote work."
    return 7, f"On-site in {job.location}."


def _salary_fit(job: Job, profile: Profile) -> tuple[int, str | None]:
    if not profile.min_salary or not job.salary_text:
        return 4, None
    if re.search(r"/\s*(hour|hr)\b|per hour", job.salary_text, re.I):
        return 4, f"Posted as an hourly rate ({job.salary_text}), not compared against your annual floor."

    numbers = [
        int(match.group(1).replace(",", ""))
        for match in re.finditer(r"(\d[\d,]{3,})", job.salary_text)
    ]
    numbers = [value for value in numbers if 20_000 <= value <= 1_500_000]
    if not numbers:
        return 4, None
    top = max(numbers)
    if top >= profile.min_salary:
        return 6, f"Posted range tops out at ${top:,}, above your floor."
    return 0, f"Posted range tops out at ${top:,}, below your ${profile.min_salary:,} floor."


def _verdict_for(score: int) -> str:
    if score >= 85:
        return "Strong match"
    if score >= 75:
        return "Good match"
    if score >= 60:
        return "Worth a look"
    if score >= 40:
        return "Weak match"
    return "Not a fit"


def score_heuristically(job: Job, profile: Profile, resume: Resume) -> ScoredMatch:
    haystack = f"{job.title} {job.company} {job.description}".lower()

    blocked_company = next(
        (
            company
            for company in profile.excluded_companies
            if company.strip() and company.lower().strip() in job.company.lower()
        ),
        None,
    )
    if blocked_company:
        return ScoredMatch(
            score=0,
            verdict="Excluded",
            reasons=[f"{blocked_company} is on your exclusion list."],
            gaps=[],
        )

    blocked_keyword = next(
        (
            keyword
            for keyword in profile.excluded_keywords
            if keyword.strip() and keyword.lower().strip() in haystack
        ),
        None,
    )
    if blocked_keyword:
        return ScoredMatch(
            score=0,
            verdict="Excluded",
            reasons=[f'Posting contains the excluded phrase "{blocked_keyword}".'],
            gaps=[],
        )

    missing_required = [
        keyword
        for keyword in profile.required_keywords
        if keyword.strip() and keyword.lower().strip() not in haystack
    ]
    if missing_required:
        return ScoredMatch(
            score=12,
            verdict="Not a fit",
            reasons=[f"Missing required keyword(s): {', '.join(missing_required)}."],
            gaps=missing_required,
        )

    title_pts, title_note = _title_alignment(job, profile)
    skill_pts, matched, missing = _skill_coverage(job, profile, resume)
    level_pts, level_note, level_gap, level_cap = _level_fit(job, profile)
    loc_pts, loc_note = _location_fit(job, profile)
    sal_pts, sal_note = _salary_fit(job, profile)
    family_adjustment = -14 if job.role_family == "adjacent" else 6

    raw = title_pts + skill_pts + level_pts + loc_pts + sal_pts + family_adjustment

    foreign = _requires_foreign_authorization(job, profile)
    caps = [cap for cap in (level_cap, 50 if foreign else None) if cap is not None]
    ceiling = min(caps) if caps else 100
    score = max(0, min(ceiling, min(100, raw)))

    reasons = [level_note, title_note, loc_note]
    if matched:
        reasons.append(
            f"You cover {len(matched)} of {len(matched) + len(missing)} named technologies "
            f"({', '.join(matched[:6])})."
        )
    if sal_note:
        reasons.append(sal_note)

    gaps = ([level_gap] if level_gap else []) + missing[:7]
    if foreign:
        label = foreign[:1].upper() + foreign[1:]
        gaps.insert(0, f"Based in {label}, so it would need work authorization you may not hold.")
        reasons.append(
            f"This role is on-site in {job.location}, outside the countries you are targeting."
        )
    if job.role_family == "adjacent":
        gaps.append("Reads as adjacent work rather than a data science or AI engineering role.")

    return ScoredMatch(score=score, verdict=_verdict_for(score), reasons=reasons, gaps=gaps)


def score_job(job: Job, profile: Profile, resume: Resume) -> ScoredMatch:
    """Public entry point. v1 is heuristic-only; keep the name for a later LLM overlay."""
    return score_heuristically(job, profile, resume)
