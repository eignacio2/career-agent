from app.models import Job, now_iso


def make_job(**overrides) -> Job:
    base = dict(
        id=1,
        source="test",
        source_id="t-1",
        title="Data Scientist",
        company="Example Co",
        location="Remote (US)",
        remote=True,
        url="https://example.com/job",
        apply_email=None,
        description="A data science role.",
        salary_text="$100,000 - $120,000",
        tags=["python", "sql"],
        role_family="data-science",
        early_career=False,
        posted_at=None,
        discovered_at=now_iso(),
        score=None,
        score_verdict=None,
        score_reasons=[],
        score_gaps=[],
        status="new",
        decided_at=None,
        run_id=None,
    )
    base.update(overrides)
    return Job.model_validate(base)
