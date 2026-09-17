from app.models import SourceJob
from app.profile import DEFAULT_PROFILE
from app.sources.filter import assess_job_title, is_plausible_target, title_matches_targets

ETHAN = DEFAULT_PROFILE.target_titles
DS = ["Data Scientist"]
SWE = ["Software Engineer"]


def _job(title: str) -> SourceJob:
    return SourceJob(
        source="test",
        source_id="x",
        title=title,
        company="Co",
        url="https://example.com",
    )


def _ok(title: str, titles: list[str] = ETHAN, internships: bool = False) -> bool:
    return is_plausible_target(_job(title), titles, include_internships=internships)


def test_office_assistant_is_hard_rejected():
    assert assess_job_title("Office Assistant — AI Lab Admin") is None
    assert not _ok("Office Assistant — AI Lab Admin")
    assert not _ok("Office Assistant — AI Lab Admin", DS)


def test_sales_and_recruiter_rejected():
    assert assess_job_title("Account Executive, Enterprise") is None
    assert assess_job_title("Technical Recruiter") is None
    assert not _ok("Account Executive, Enterprise")
    assert not _ok("Technical Recruiter")


def test_data_scientist_is_classified_but_not_an_ethan_target():
    assessment = assess_job_title("Data Scientist I (New Grad)")
    assert assessment is not None
    assert assessment.role == "data-science"
    assert assessment.early_career is True
    assert not _ok("Data Scientist I (New Grad)")


def test_data_scientist_is_kept_when_targeted():
    assert _ok("Data Scientist I (New Grad)", DS)
    assert _ok("Senior Data Scientist, Demand Forecasting", DS)
    assert not _ok("Associate AI Engineer, University Graduate", DS)
    assert not _ok("Forward Deployed Engineer, New Grad", DS)


def test_software_engineer_is_kept_when_targeted():
    assert _ok("Software Engineer, University Graduate", SWE)
    assert not _ok("Data Analyst, Early Career Program", SWE)
    assert not _ok("Associate AI Engineer, University Graduate", SWE)


def test_empty_targets_keep_nothing():
    assert not _ok("Associate AI Engineer, University Graduate", [])


def test_ml_abbreviation_matches_machine_learning():
    assert title_matches_targets("Junior Machine Learning Engineer", ["ML Engineer"])
    assert _ok("Junior Machine Learning Engineer", ["ML Engineer"])


def test_associate_ai_engineer_is_plausible():
    assessment = assess_job_title("Associate AI Engineer, University Graduate")
    assert assessment is not None
    assert assessment.role == "ai-engineering"
    assert assessment.early_career is True
    assert _ok("Associate AI Engineer, University Graduate")


def test_forward_deployed_is_plausible():
    assessment = assess_job_title("Forward Deployed Engineer, New Grad")
    assert assessment is not None
    assert assessment.role == "forward-deployed"
    assert _ok("Forward Deployed Engineer, New Grad")
    assert _ok("Forward Deployed Software Engineer")
    assert _ok("Customer Engineer, AI Platform")


def test_fde_skips_customer_success_hard_reject():
    """Palantir-style titles mention Customer Success as the team, not the job."""
    assessment = assess_job_title("Forward Deployed Engineer, Customer Success")
    assert assessment is not None
    assert assessment.role == "forward-deployed"
    assert _ok("Forward Deployed Engineer, Customer Success")


def test_staff_mle_is_senior_only():
    assessment = assess_job_title("Staff Machine Learning Engineer")
    assert assessment is not None
    assert assessment.senior_only is True
    assert assessment.role == "ai-engineering"
    assert _ok("Staff Machine Learning Engineer")


def test_prompt_engineer_kept_via_ai_family_expansion():
    """Listing AI Engineer also keeps other AI-engineering titles."""
    assert _ok("Prompt Engineer")
    assert not title_matches_targets("Prompt Engineer", ["AI Engineer"])


def test_internships_filtered_by_default():
    job = _job("AI Engineer Intern")
    assert is_plausible_target(job, ETHAN) is False
    assert is_plausible_target(job, ETHAN, include_internships=True) is True


def test_adjacent_data_analyst_is_not_a_target():
    assessment = assess_job_title("Data Analyst, Early Career Program")
    assert assessment is not None
    assert assessment.role == "adjacent"
    assert not _ok("Data Analyst, Early Career Program")
    assert _ok("Data Analyst, Early Career Program", ["Data Analyst"])


def test_forward_deployed_product_manager_is_not_a_target():
    assert not _ok("Forward Deployed Product Manager, Public Sector")
    assert _ok("Forward Deployed Software Engineer, Public Sector")


def test_generic_new_grad_swe_is_not_an_ethan_target():
    assessment = assess_job_title("Software Engineer, University Graduate")
    assert assessment is not None
    assert assessment.role == "adjacent"
    assert not _ok("Software Engineer, University Graduate")
