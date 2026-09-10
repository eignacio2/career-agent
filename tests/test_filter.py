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


def test_data_scientist_i_is_early_career_ds():
    assessment = assess_job_title("Data Scientist I (New Grad)")
    assert assessment is not None
    assert assessment.role == "data-science"
    assert assessment.early_career is True


def test_associate_ai_engineer_is_ai_engineering():
    assessment = assess_job_title("Associate AI Engineer, University Graduate")
    assert assessment is not None
    assert assessment.role == "ai-engineering"
    assert assessment.early_career is True


def test_staff_mle_is_senior_only():
    assessment = assess_job_title("Staff Machine Learning Engineer")
    assert assessment is not None
    assert assessment.senior_only is True
    assert assessment.role == "ai-engineering"


def test_internships_filtered_by_default():
    job = _job("Data Scientist Intern")
    assert is_plausible_target(job) is False
    assert is_plausible_target(job, include_internships=True) is True


def test_adjacent_data_analyst_passes_filter():
    assessment = assess_job_title("Data Analyst, Early Career Program")
    assert assessment is not None
    assert assessment.role == "adjacent"


def test_generic_new_grad_swe_is_adjacent_not_dropped():
    """Title names no DS/AI discipline, but early-career programmes still count."""
    assessment = assess_job_title("Software Engineer, University Graduate")
    assert assessment is not None
    assert assessment.role == "adjacent"
    assert assessment.early_career is True
