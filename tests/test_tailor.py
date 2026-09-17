from app.facts import check_overlay
from app.models import OverlayDraft
from app.profile import DEFAULT_PROFILE, DEFAULT_RESUME
from app.tailor import select_bullets, tailor_application
from tests.helpers import make_job


def _ai_job():
    return make_job(
        title="Associate AI Engineer, University Graduate",
        role_family="ai-engineering",
        early_career=True,
        description="n8n Gemini agents tool calling python FastAPI",
        tags=["python", "llm", "agents"],
    )


def test_tailor_does_not_invent_employers():
    job = _ai_job()
    tailored = tailor_application(job, DEFAULT_PROFILE, DEFAULT_RESUME)
    assert "Wayfair" in tailored.resume_markdown
    assert "Blue Harbor" not in tailored.resume_markdown
    assert job.title in tailored.resume_markdown
    assert DEFAULT_RESUME.experience[0].company in tailored.cover_letter
    assert tailored.generated_by == "heuristic"
    assert any("overlay skipped" in note.lower() for note in tailored.notes)


def test_select_bullets_prefers_overlapping_skills():
    job = make_job(
        title="AI Engineer",
        description="We need n8n, Gemini, and tool calling for agents.",
        tags=["n8n", "gemini", "agents"],
        role_family="ai-engineering",
    )
    selected = select_bullets(DEFAULT_RESUME, job)
    bullets = selected[DEFAULT_RESUME.experience[0].id]
    assert bullets
    assert any("n8n" in bullet.lower() or "gemini" in bullet.lower() or "agent" in bullet.lower() for bullet in bullets)


def test_overlay_rewrite_is_kept_when_facts_pass():
    job = _ai_job()
    role_id = DEFAULT_RESUME.experience[0].id

    def complete(_system: str, _user: str) -> dict:
        return {
            "summary": "New-grad targeting Associate AI Engineer at Example Co. Wayfair n8n + Gemini work.",
            "cover_letter": (
                "Dear Example Co hiring team,\n\n"
                "I am applying for the Associate AI Engineer role. At Wayfair I built n8n "
                "and Gemini agent workflows that ran without a developer watching.\n"
            ),
            "bullets_by_experience_id": {
                role_id: [
                    "At Wayfair, reworked n8n + Gemini agent workflows so they ran unattended.",
                    "Designed tool-calling and prompt structure so the agent took actions, not just text.",
                ]
            },
        }

    tailored = tailor_application(job, DEFAULT_PROFILE, DEFAULT_RESUME, complete=complete)
    assert tailored.generated_by == "llm"
    assert "rewrote" in " ".join(tailored.notes).lower()
    assert "unattended" in tailored.resume_markdown
    assert "Wayfair" in tailored.resume_markdown
    assert "Blue Harbor" not in tailored.resume_markdown
    assert "Wayfair" in tailored.cover_letter


def test_overlay_is_rejected_when_it_invents_an_employer():
    job = _ai_job()
    role_id = DEFAULT_RESUME.experience[0].id
    heuristic = tailor_application(job, DEFAULT_PROFILE, DEFAULT_RESUME)

    def complete(_system: str, _user: str) -> dict:
        return {
            "summary": "Shipped production RAG at Blue Harbor with a 40% lift.",
            "cover_letter": "Dear Example Co hiring team, at Blue Harbor I cut ticket time 40%.",
            "bullets_by_experience_id": {
                role_id: ["At Blue Harbor I shipped Kubernetes RAG with a 40% lift."]
            },
        }

    tailored = tailor_application(job, DEFAULT_PROFILE, DEFAULT_RESUME, complete=complete)
    assert tailored.generated_by == "heuristic"
    assert any("rejected" in note.lower() for note in tailored.notes)
    assert "Blue Harbor" not in tailored.resume_markdown
    assert "40%" not in tailored.cover_letter
    assert tailored.cover_letter == heuristic.cover_letter


def test_overlay_skipped_when_complete_returns_none():
    job = _ai_job()
    tailored = tailor_application(
        job, DEFAULT_PROFILE, DEFAULT_RESUME, complete=lambda _s, _u: None
    )
    assert tailored.generated_by == "heuristic"
    assert any("no json" in note.lower() for note in tailored.notes)


def test_facts_gate_allows_known_skill_after_with():
    job = _ai_job()
    original = select_bullets(DEFAULT_RESUME, job)
    role_id = DEFAULT_RESUME.experience[0].id
    draft = OverlayDraft(
        summary="New-grad targeting Associate AI Engineer at Example Co.",
        cover_letter="Dear Example Co, at Wayfair I built workflows with Gemini.",
        bullets_by_experience_id={
            role_id: ["At Wayfair I built n8n workflows with Gemini."]
        },
    )
    ok, reason = check_overlay(
        resume=DEFAULT_RESUME,
        profile=DEFAULT_PROFILE,
        job=job,
        original_bullets=original,
        draft=draft,
    )
    assert ok is True, reason


def test_facts_gate_catches_invented_skill():
    job = _ai_job()
    original = select_bullets(DEFAULT_RESUME, job)
    role_id = DEFAULT_RESUME.experience[0].id
    draft = OverlayDraft(
        summary="Shipped kubernetes at Wayfair.",
        cover_letter="Dear Example Co, I wrote kubernetes manifests at Wayfair.",
        bullets_by_experience_id={
            role_id: ["Wrote kubernetes manifests for the n8n agent at Wayfair."]
        },
    )
    ok, reason = check_overlay(
        resume=DEFAULT_RESUME,
        profile=DEFAULT_PROFILE,
        job=job,
        original_bullets=original,
        draft=draft,
    )
    assert ok is False
    assert "kubernetes" in reason.lower()


def test_facts_gate_catches_invented_metric():
    job = _ai_job()
    original = select_bullets(DEFAULT_RESUME, job)
    role_id = DEFAULT_RESUME.experience[0].id
    draft = OverlayDraft(
        summary="Worked at Wayfair with n8n.",
        cover_letter="Dear Example Co, at Wayfair I improved n8n workflows by 40%.",
        bullets_by_experience_id={role_id: ["At Wayfair I improved n8n workflows by 40%."]},
    )
    ok, reason = check_overlay(
        resume=DEFAULT_RESUME,
        profile=DEFAULT_PROFILE,
        job=job,
        original_bullets=original,
        draft=draft,
    )
    assert ok is False
    assert "40%" in reason or "metric" in reason.lower()
