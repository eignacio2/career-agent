from app.geo import is_chicago_office, location_allowed
from app.profile import DEFAULT_PROFILE
from tests.helpers import make_job


def test_keeps_chicago_onsite():
    job = make_job(
        title="Forward Deployed Engineer, New Grad",
        role_family="forward-deployed",
        remote=False,
        location="Chicago, IL",
    )
    assert is_chicago_office(job)
    ok, reason = location_allowed(job, DEFAULT_PROFILE)
    assert ok is True
    assert "chicago" in reason.lower()


def test_keeps_chicago_hybrid():
    job = make_job(
        title="Associate AI Engineer, University Graduate",
        role_family="ai-engineering",
        remote=False,
        location="Chicago, IL (Hybrid)",
    )
    ok, reason = location_allowed(job, DEFAULT_PROFILE)
    assert ok is True
    assert "hybrid" in reason.lower()


def test_keeps_chicago_or_remote_dual_listing():
    job = make_job(
        title="AI Engineer",
        role_family="ai-engineering",
        remote=True,
        location="Chicago, IL or Remote",
    )
    ok, _reason = location_allowed(job, DEFAULT_PROFILE)
    assert ok is True


def test_drops_remote_only():
    job = make_job(
        title="Machine Learning Engineer",
        role_family="ai-engineering",
        remote=True,
        location="Remote (US)",
    )
    ok, reason = location_allowed(job, DEFAULT_PROFILE)
    assert ok is False
    assert "chicago" in reason.lower()


def test_drops_remote_chicago_timezone():
    job = make_job(
        title="AI Engineer",
        role_family="ai-engineering",
        remote=True,
        location="Remote (Chicago)",
    )
    ok, reason = location_allowed(job, DEFAULT_PROFILE)
    assert ok is False
    assert "remote-only" in reason.lower()


def test_drops_other_us_cities():
    job = make_job(
        title="Forward Deployed Software Engineer",
        role_family="forward-deployed",
        remote=False,
        location="New York, NY",
    )
    ok, reason = location_allowed(job, DEFAULT_PROFILE)
    assert ok is False
    assert "not a chicago" in reason.lower()


def test_drops_london():
    job = make_job(
        title="Machine Learning Engineer",
        role_family="ai-engineering",
        remote=False,
        location="London, United Kingdom",
    )
    ok, _reason = location_allowed(job, DEFAULT_PROFILE)
    assert ok is False


def test_any_mode_keeps_foreign_onsite():
    profile = DEFAULT_PROFILE.model_copy(update={"location_mode": "any"})
    job = make_job(
        title="Machine Learning Engineer",
        role_family="ai-engineering",
        remote=False,
        location="London, United Kingdom",
    )
    ok, _reason = location_allowed(job, profile)
    assert ok is True
