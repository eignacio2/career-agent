from app.pipeline import run_agent
from app.sources.sample import SampleSource


def test_offline_run_queues_new_grad_and_caps_senior(tmp_db):
    result = run_agent(trigger="test", offline=True, limit_per_source=25)
    assert result["status"] == "success"
    jobs = tmp_db.list_jobs(limit=50)
    titles = {job.title: job for job in jobs}

    assert "Data Scientist I (New Grad)" in titles
    assert titles["Data Scientist I (New Grad)"].status in {"queued", "shortlisted"}
    assert (titles["Data Scientist I (New Grad)"].score or 0) >= 72

    assert "Senior Data Scientist, Demand Forecasting" in titles
    senior = titles["Senior Data Scientist, Demand Forecasting"]
    assert senior.status == "skipped"
    assert (senior.score or 0) < 72
    assert (senior.score or 0) <= 45

    # Title pre-filter drops the office assistant before it is stored.
    assert "Office Assistant — AI Lab Admin" not in titles

    # Sample board itself still contains the assistant; the filter is the gate.
    sample_titles = {job.title for job in SampleSource().fetch([], 25)}
    assert "Office Assistant — AI Lab Admin" in sample_titles


def test_second_run_is_idempotent(tmp_db):
    first = run_agent(trigger="a", offline=True)
    second = run_agent(trigger="b", offline=True)
    assert first["stats"]["discovered"] > 0
    assert second["stats"]["discovered"] == 0
    assert tmp_db.count_jobs()["total"] == first["stats"]["discovered"]
