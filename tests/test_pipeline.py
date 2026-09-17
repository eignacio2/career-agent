from app.pipeline import run_agent
from app.profile import DEFAULT_PROFILE, DEFAULT_RESUME
from app.setup import SetupIncomplete
from app.sources.sample import SampleSource


def test_blank_profile_cannot_run(tmp_db):
    try:
        run_agent(trigger="test", offline=True)
        raise AssertionError("blank profile should not start a search")
    except SetupIncomplete as exc:
        assert "full name" in exc.missing
        assert "email" in exc.missing
        assert "target title" in " ".join(exc.missing)


def test_offline_run_queues_new_grad_and_caps_senior(tmp_db_ready):
    result = run_agent(trigger="test", offline=True, limit_per_source=25)
    assert result["status"] == "success"
    jobs = tmp_db_ready.list_jobs(limit=50)
    titles = {job.title: job for job in jobs}

    assert "Associate AI Engineer, University Graduate" in titles
    assert titles["Associate AI Engineer, University Graduate"].status in {"queued", "shortlisted"}
    assert (titles["Associate AI Engineer, University Graduate"].score or 0) >= 72

    assert "Forward Deployed Engineer, New Grad" in titles
    fde = titles["Forward Deployed Engineer, New Grad"]
    assert fde.status in {"queued", "shortlisted"}
    assert (fde.score or 0) >= 72
    assert fde.role_family == "forward-deployed"

    # Data science is classified, but it is no longer a target family.
    assert "Data Scientist I (New Grad)" not in titles
    assert "Senior Data Scientist, Demand Forecasting" not in titles
    assert "Data Analyst, Early Career Program" not in titles
    assert "Software Engineer, University Graduate" not in titles

    # Title pre-filter drops the office assistant before it is stored.
    assert "Office Assistant — AI Lab Admin" not in titles

    # Location filter keeps remote, hybrid, and on-site in any city.
    # Data-science titles still never reach insert (Neckar).
    companies = {job.company for job in jobs}
    assert "Halcyon Logistics" in companies  # Denver hybrid junior MLE
    assert "Harborview AI" in companies  # remote 4+ years — stored so the cap can fire
    assert "Thames Analytics" in companies  # London on-site — stored, visa-capped
    assert "Neckar Mobility" not in companies
    assert titles["Associate AI Engineer, University Graduate"].location.startswith("Chicago")
    assert titles["Forward Deployed Engineer, New Grad"].location.startswith("Chicago")

    harbor = titles["AI Engineer, Retrieval Platform"]
    assert harbor.status == "skipped"
    assert (harbor.score or 0) <= 45

    thames = next(job for job in jobs if job.company == "Thames Analytics")
    assert (thames.score or 0) <= 50
    assert thames.status == "skipped"

    # Senior/staff AI titles still reach the scorer so the cap can fire.
    assert "Staff Machine Learning Engineer" in titles
    staff = titles["Staff Machine Learning Engineer"]
    assert staff.status == "skipped"
    assert (staff.score or 0) <= 25

    apps = tmp_db_ready.list_applications()
    assert apps, "queued roles should get a tailored pack"
    assert all("Wayfair" in app.resume_markdown or "Ignacio" in app.resume_markdown for app in apps)

    digest = tmp_db_ready.latest_digest()
    assert digest is not None
    assert digest.path

    # Sample board itself still contains the assistant; the filter is the gate.
    sample_titles = {job.title for job in SampleSource().fetch([], 25)}
    assert "Office Assistant — AI Lab Admin" in sample_titles
    assert "Data Scientist I (New Grad)" in sample_titles


def test_offline_run_keeps_data_science_when_those_titles_are_listed(tmp_db):
    profile = DEFAULT_PROFILE.model_copy(
        update={
            "full_name": "Alex Example",
            "email": "alex@example.com",
            "target_titles": ["Data Scientist"],
        }
    )
    tmp_db.save_profile(profile)
    tmp_db.save_resume(DEFAULT_RESUME)
    result = run_agent(trigger="test", offline=True, limit_per_source=25)
    assert result["status"] == "success"
    titles = {job.title for job in tmp_db.list_jobs(limit=50)}
    assert "Data Scientist I (New Grad)" in titles
    assert "Senior Data Scientist, Demand Forecasting" in titles
    assert "Data Scientist" in titles  # Neckar Stuttgart — stored, then visa-capped
    assert "Associate AI Engineer, University Graduate" not in titles
    assert "Forward Deployed Engineer, New Grad" not in titles
    assert "Office Assistant — AI Lab Admin" not in titles


def test_second_run_is_idempotent(tmp_db_ready):
    first = run_agent(trigger="a", offline=True)
    second = run_agent(trigger="b", offline=True)
    assert first["stats"]["discovered"] > 0
    assert second["stats"]["discovered"] == 0
    assert tmp_db_ready.count_jobs()["total"] == first["stats"]["discovered"]
