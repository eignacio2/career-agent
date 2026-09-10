from app.pipeline import run_agent
from app.sources.sample import SampleSource


def test_offline_run_queues_new_grad_and_caps_senior(tmp_db):
    result = run_agent(trigger="test", offline=True, limit_per_source=25)
    assert result["status"] == "success"
    jobs = tmp_db.list_jobs(limit=50)
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

    # Location filter (us-or-remote) drops foreign on-site before scoring.
    assert "Thames Analytics" not in {job.company for job in jobs}
    assert "Neckar Mobility" not in {job.company for job in jobs}

    # Senior/staff AI titles still reach the scorer so the cap can fire.
    assert "Staff Machine Learning Engineer" in titles
    staff = titles["Staff Machine Learning Engineer"]
    assert staff.status == "skipped"
    assert (staff.score or 0) <= 25

    apps = tmp_db.list_applications()
    assert apps, "queued roles should get a tailored pack"
    assert all("Wayfair" in app.resume_markdown or "Ignacio" in app.resume_markdown for app in apps)

    digest = tmp_db.latest_digest()
    assert digest is not None
    assert digest.path

    # Sample board itself still contains the assistant; the filter is the gate.
    sample_titles = {job.title for job in SampleSource().fetch([], 25)}
    assert "Office Assistant — AI Lab Admin" in sample_titles
    assert "Data Scientist I (New Grad)" in sample_titles


def test_second_run_is_idempotent(tmp_db):
    first = run_agent(trigger="a", offline=True)
    second = run_agent(trigger="b", offline=True)
    assert first["stats"]["discovered"] > 0
    assert second["stats"]["discovered"] == 0
    assert tmp_db.count_jobs()["total"] == first["stats"]["discovered"]
