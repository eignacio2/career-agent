from app.digest import build_digest_text
from app.models import Application, RunStats, now_iso
from app.profile import DEFAULT_PROFILE
from tests.helpers import make_job


def _app(job_id: int, channel: str = "external_form") -> Application:
    stamp = now_iso()
    return Application(
        id=job_id,
        job_id=job_id,
        status="needs_manual_submit",
        channel=channel,
        resume_markdown="# resume",
        cover_letter="Dear team",
        created_at=stamp,
        updated_at=stamp,
    )


def test_digest_lists_ready_and_close_matches_not_poor_ones():
    ready = make_job(
        id=1,
        title="Associate AI Engineer, University Graduate",
        company="Northgate Software",
        score=96,
        status="queued",
        url="https://example.com/northgate",
    )
    close = make_job(
        id=2,
        title="Junior AI Engineer",
        company="Halcyon Logistics",
        score=64,
        status="shortlisted",
        score_reasons=["Title contains your target role."],
        url="https://example.com/halcyon",
    )
    poor = make_job(
        id=3,
        title="Staff Machine Learning Engineer",
        company="Ashgrove Research",
        score=25,
        status="skipped",
        url="https://example.com/ashgrove",
    )
    subject, text = build_digest_text(
        profile=DEFAULT_PROFILE,
        stats=RunStats(discovered=3, scored=3, queued=1, skipped=1, awaiting_review=1, top_score=96),
        submitted=[],
        awaiting=[(_app(1), ready)],
        shortlisted=[close],
        notes=["SMTP is not set; mail lands in .data/outbox instead of a real inbox."],
    )
    assert "ready for you" in subject
    assert "Northgate Software" in text
    assert "Halcyon Logistics" in text
    assert "Ashgrove Research" not in text
    assert "Staff Machine Learning Engineer" not in text
    assert "not listed" in text
    assert DEFAULT_PROFILE.digest_email in text


def test_digest_falls_back_to_profile_email_when_digest_address_blank():
    profile = DEFAULT_PROFILE.model_copy(update={"digest_email": ""})
    _, text = build_digest_text(
        profile=profile,
        stats=RunStats(),
        submitted=[],
        awaiting=[],
        shortlisted=[],
        notes=[],
    )
    assert profile.email in text
