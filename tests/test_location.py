from app.geo import location_allowed
from app.profile import DEFAULT_PROFILE
from tests.helpers import make_job


def test_us_or_remote_drops_london_onsite():
    job = make_job(
        title="Machine Learning Engineer",
        role_family="ai-engineering",
        remote=False,
        location="London, United Kingdom",
    )
    ok, reason = location_allowed(job, DEFAULT_PROFILE)
    assert ok is False
    assert "authorization" in reason.lower() or "london" in reason.lower()


def test_us_or_remote_keeps_us_remote():
    job = make_job(
        title="Machine Learning Engineer",
        role_family="ai-engineering",
        remote=True,
        location="Remote (US)",
    )
    ok, _reason = location_allowed(job, DEFAULT_PROFILE)
    assert ok is True


def test_us_or_remote_drops_remote_tied_to_a_foreign_city():
    london = make_job(
        title="Machine Learning Engineer",
        role_family="ai-engineering",
        remote=True,
        location="London, United Kingdom (Remote)",
    )
    ok, reason = location_allowed(london, DEFAULT_PROFILE)
    assert ok is False
    assert "london" in reason.lower()

    uk = make_job(
        title="AI Engineer - FDE (Forward Deployed Engineer)",
        role_family="forward-deployed",
        remote=True,
        location="UK",
    )
    ok, reason = location_allowed(uk, DEFAULT_PROFILE)
    assert ok is False
    assert "uk" in reason.lower()


def test_us_or_remote_keeps_chicago_onsite():
    job = make_job(
        title="Forward Deployed Engineer, New Grad",
        role_family="forward-deployed",
        remote=False,
        location="Chicago, IL",
    )
    ok, _reason = location_allowed(job, DEFAULT_PROFILE)
    assert ok is True


def test_targets_or_remote_drops_unknown_us_city():
    profile = DEFAULT_PROFILE.model_copy(update={"location_mode": "targets-or-remote"})
    job = make_job(
        title="AI Engineer",
        role_family="ai-engineering",
        remote=False,
        location="Boise, ID",
    )
    ok, reason = location_allowed(job, profile)
    assert ok is False
    assert "target" in reason.lower()


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
