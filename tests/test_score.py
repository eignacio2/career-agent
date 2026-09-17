"""Caps, not penalties: a 5+ years posting must never reach the apply threshold."""

from app.profile import DEFAULT_PROFILE, DEFAULT_RESUME
from app.scoring.score import score_heuristically
from tests.helpers import make_job

THRESHOLD = DEFAULT_PROFILE.auto_apply_threshold  # 72


def test_new_grad_role_clears_threshold():
    job = make_job(
        title="Associate AI Engineer, University Graduate",
        early_career=True,
        role_family="ai-engineering",
        remote=False,
        location="Chicago, IL (Hybrid)",
        description=(
            "University graduate programme. Graduating within the last year. "
            "Strong Python. LLM API, FastAPI, RAG. No prior industry ML required."
        ),
        tags=["python", "llm", "rag", "fastapi"],
        salary_text="$105,000 - $125,000",
    )
    match = score_heuristically(job, DEFAULT_PROFILE, DEFAULT_RESUME)
    assert match.score >= THRESHOLD, match
    assert match.verdict in {"Good match", "Strong match", "Worth a look"}
    assert match.score >= 72


def test_remote_new_grad_clears_threshold():
    """Remote is no longer a 2-point location stub; it can still clear 72."""
    job = make_job(
        title="Associate AI Engineer, University Graduate",
        early_career=True,
        role_family="ai-engineering",
        remote=True,
        location="Remote (US)",
        description=(
            "University graduate programme. Graduating within the last year. "
            "Strong Python. LLM API, FastAPI, RAG. No prior industry ML required."
        ),
        tags=["python", "llm", "rag", "fastapi"],
        salary_text="$105,000 - $125,000",
    )
    match = score_heuristically(job, DEFAULT_PROFILE, DEFAULT_RESUME)
    assert match.score >= THRESHOLD, match
    assert any("remote" in reason.lower() for reason in match.reasons)


def test_denver_hybrid_is_not_a_hard_drop_in_score():
    job = make_job(
        title="Junior Machine Learning Engineer",
        early_career=True,
        role_family="ai-engineering",
        remote=False,
        location="Denver, CO (Hybrid)",
        description="1+ years of experience. Python and one ML framework. Docker.",
        tags=["python", "ml", "docker"],
        salary_text="$98,000 - $118,000",
    )
    match = score_heuristically(job, DEFAULT_PROFILE, DEFAULT_RESUME)
    assert any("hybrid" in reason.lower() for reason in match.reasons)
    assert match.score > 16


def test_new_grad_fde_clears_threshold():
    job = make_job(
        title="Forward Deployed Engineer, New Grad",
        early_career=True,
        role_family="forward-deployed",
        remote=False,
        location="Chicago, IL",
        description=(
            "Graduating this year. Strong Python. LLM API and customer-facing engineering. "
            "0-1 years of professional experience."
        ),
        tags=["python", "llm", "agents"],
        salary_text="$120,000 - $145,000",
    )
    match = score_heuristically(job, DEFAULT_PROFILE, DEFAULT_RESUME)
    assert match.score >= THRESHOLD, match
    assert match.score >= 72


def test_five_plus_years_is_capped_below_threshold():
    job = make_job(
        title="Senior Data Scientist, Demand Forecasting",
        role_family="data-science",
        remote=True,
        description=(
            "5+ years in applied data science with production ownership. "
            "Python, SQL, pandas, scikit-learn, forecasting, airflow, snowflake."
        ),
        tags=["python", "sql", "forecasting"],
        salary_text="$170,000 - $200,000",
    )
    match = score_heuristically(job, DEFAULT_PROFILE, DEFAULT_RESUME)
    assert match.score < THRESHOLD, match
    assert match.score <= 45
    assert any("years" in gap.lower() for gap in match.gaps)


def test_four_plus_years_without_senior_in_title_still_capped():
    job = make_job(
        title="AI Engineer, Retrieval Platform",
        role_family="ai-engineering",
        remote=True,
        description="4+ years writing production Python. RAG, llm, aws, fastapi, docker.",
        tags=["python", "rag", "llm", "aws"],
        salary_text="$185,000 - $225,000",
    )
    match = score_heuristically(job, DEFAULT_PROFILE, DEFAULT_RESUME)
    assert match.score < THRESHOLD, match
    assert match.score <= 45


def test_staff_title_is_capped_hard():
    job = make_job(
        title="Staff Machine Learning Engineer",
        role_family="ai-engineering",
        remote=True,
        description="Lead the ML platform. Kubernetes and PyTorch.",
        tags=["python", "ml"],
    )
    match = score_heuristically(job, DEFAULT_PROFILE, DEFAULT_RESUME)
    assert match.score <= 25
    assert match.score < THRESHOLD


def test_senior_title_overrides_new_grad_board_flag():
    """SimplifyJobs tags every listing early-career; a Senior title must still cap."""
    job = make_job(
        title="Senior Machine Learning Engineer - Systems - Embodied AI/Npcs",
        role_family="ai-engineering",
        early_career=True,
        remote=True,
        description="Ship embodied AI systems.",
        tags=["python", "ml"],
    )
    match = score_heuristically(job, DEFAULT_PROFILE, DEFAULT_RESUME)
    assert match.score < THRESHOLD, match
    assert match.score <= 45
    assert "senior" in match.reasons[0].lower()


def test_foreign_onsite_is_capped_at_50():
    job = make_job(
        title="Machine Learning Engineer",
        role_family="ai-engineering",
        remote=False,
        location="London, United Kingdom",
        description="2+ years of experience shipping ML models. Python, pytorch.",
        tags=["python", "ml"],
    )
    match = score_heuristically(job, DEFAULT_PROFILE, DEFAULT_RESUME)
    assert match.score <= 50
    assert any("authorization" in gap.lower() for gap in match.gaps)


def test_remote_london_is_not_a_visa_problem():
    job = make_job(
        title="Machine Learning Engineer",
        role_family="ai-engineering",
        remote=True,
        location="London, United Kingdom (Remote)",
        description="New graduate programme. Python.",
        early_career=True,
        tags=["python"],
    )
    match = score_heuristically(job, DEFAULT_PROFILE, DEFAULT_RESUME)
    assert not any("authorization" in gap.lower() for gap in match.gaps)


def test_excluded_company_is_zero():
    profile = DEFAULT_PROFILE.model_copy(update={"excluded_companies": ["Larkspur"]})
    job = make_job(company="Larkspur Logistics", title="Data Scientist I")
    match = score_heuristically(job, profile, DEFAULT_RESUME)
    assert match.score == 0
    assert match.verdict == "Excluded"


def test_mid_level_candidate_is_not_capped_on_five_years():
    """Caps are relative to the candidate's band, not a universal '5 years is bad'."""
    profile = DEFAULT_PROFILE.model_copy(
        update={"experience_level": "mid", "years_experience": 6, "max_years_required": 8}
    )
    job = make_job(
        title="Data Scientist, Experimentation",
        role_family="data-science",
        remote=False,
        location="Chicago, IL",
        description="5+ years in a data science role. Python, SQL, experimentation.",
        tags=["python", "sql"],
    )
    match = score_heuristically(job, profile, DEFAULT_RESUME)
    assert match.score > 45


def test_short_skill_r_does_not_match_route():
    from app.scoring.score import extract_job_skills

    job = make_job(
        title="Junior Machine Learning Engineer",
        description="Join a four-person ML team supporting route optimisation.",
        tags=["python", "ml"],
        role_family="ai-engineering",
    )
    skills = extract_job_skills(job)
    assert "r" not in skills
    assert "python" in skills


def test_targeted_swe_is_not_treated_as_adjacent_penalty():
    profile = DEFAULT_PROFILE.model_copy(update={"target_titles": ["Software Engineer"]})
    job = make_job(
        title="Software Engineer, University Graduate",
        early_career=True,
        role_family="adjacent",
        remote=True,
        location="Remote (US)",
        description="Graduating within the year. Strong coding.",
        tags=["java"],
    )
    match = score_heuristically(job, profile, DEFAULT_RESUME)
    assert not any("adjacent" in gap.lower() for gap in match.gaps)
