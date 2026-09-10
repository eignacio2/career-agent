from app.models import SourceJob
from app.sources.filter import assess_job_title, is_plausible_target


def _job(title: str) -> SourceJob:
    return SourceJob(
        source="test",
        source_id="x",
        title=title,
        company="Co",
        url="https://example.com",
    )


def test_office_assistant_is_hard_rejected():
    assert assess_job_title("Office Assistant — AI Lab Admin") is None
    assert not is_plausible_target(_job("Office Assistant — AI Lab Admin"))


def test_sales_and_recruiter_rejected():
    assert assess_job_title("Account Executive, Enterprise") is None
    assert assess_job_title("Technical Recruiter") is None


def test_data_scientist_is_classified_but_not_a_target():
    assessment = assess_job_title("Data Scientist I (New Grad)")
    assert assessment is not None
    assert assessment.role == "data-science"
    assert assessment.early_career is True
    assert not is_plausible_target(_job("Data Scientist I (New Grad)"))


def test_associate_ai_engineer_is_plausible():
    assessment = assess_job_title("Associate AI Engineer, University Graduate")
    assert assessment is not None
    assert assessment.role == "ai-engineering"
    assert assessment.early_career is True
    assert is_plausible_target(_job("Associate AI Engineer, University Graduate"))


def test_forward_deployed_is_plausible():
    assessment = assess_job_title("Forward Deployed Engineer, New Grad")
    assert assessment is not None
    assert assessment.role == "forward-deployed"
    assert is_plausible_target(_job("Forward Deployed Engineer, New Grad"))
    assert is_plausible_target(_job("Forward Deployed Software Engineer"))
    assert is_plausible_target(_job("Customer Engineer, AI Platform"))


def test_fde_skips_customer_success_hard_reject():
    """Palantir-style titles mention Customer Success as the team, not the job."""
    assessment = assess_job_title("Forward Deployed Engineer, Customer Success")
    assert assessment is not None
    assert assessment.role == "forward-deployed"
    assert is_plausible_target(_job("Forward Deployed Engineer, Customer Success"))


def test_staff_mle_is_senior_only():
    assessment = assess_job_title("Staff Machine Learning Engineer")
    assert assessment is not None
    assert assessment.senior_only is True
    assert assessment.role == "ai-engineering"


def test_internships_filtered_by_default():
    job = _job("AI Engineer Intern")
    assert is_plausible_target(job) is False
    assert is_plausible_target(job, include_internships=True) is True


def test_adjacent_data_analyst_is_not_a_target():
    assessment = assess_job_title("Data Analyst, Early Career Program")
    assert assessment is not None
    assert assessment.role == "adjacent"
    assert not is_plausible_target(_job("Data Analyst, Early Career Program"))


def test_generic_new_grad_swe_is_not_a_target():
    assessment = assess_job_title("Software Engineer, University Graduate")
    assert assessment is not None
    assert assessment.role == "adjacent"
    assert not is_plausible_target(_job("Software Engineer, University Graduate"))
