from app.profile import DEFAULT_PROFILE, DEFAULT_RESUME
from app.tailor import select_bullets, tailor_application
from tests.helpers import make_job


def test_tailor_does_not_invent_employers():
    job = make_job(
        title="Associate AI Engineer, University Graduate",
        role_family="ai-engineering",
        early_career=True,
        description="n8n Gemini agents tool calling python FastAPI",
        tags=["python", "llm", "agents"],
    )
    tailored = tailor_application(job, DEFAULT_PROFILE, DEFAULT_RESUME)
    assert "Wayfair" in tailored.resume_markdown
    assert "Blue Harbor" not in tailored.resume_markdown
    assert job.title in tailored.resume_markdown
    assert DEFAULT_RESUME.experience[0].company in tailored.cover_letter


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
