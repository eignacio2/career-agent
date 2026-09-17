from app import config
from app.llm import _parse_json_object, request_overlay
from app.profile import DEFAULT_PROFILE, DEFAULT_RESUME
from app.tailor import select_bullets
from tests.helpers import make_job


def test_llm_configured_needs_key_or_local_base(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    assert config.llm_configured() is False

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    assert config.llm_configured() is True

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_BASE_URL", "http://127.0.0.1:11434/v1")
    assert config.llm_configured() is True


def test_parse_json_object_reads_fenced_and_trailing_text():
    fenced = _parse_json_object("```json\n{\"summary\": \"ok\", \"cover_letter\": \"hi\"}\n```")
    assert fenced == {"summary": "ok", "cover_letter": "hi"}

    noisy = _parse_json_object("Sure.\n{\"summary\": \"ok\"}\nThanks.")
    assert noisy == {"summary": "ok"}

    assert _parse_json_object("not json") is None
    assert _parse_json_object("[1, 2]") is None


def test_request_overlay_returns_none_on_invalid_payload():
    job = make_job(title="AI Engineer", description="python n8n", tags=["python"])
    bullets = select_bullets(DEFAULT_RESUME, job)
    assert request_overlay(job, DEFAULT_PROFILE, DEFAULT_RESUME, bullets, ["python"], complete=lambda _s, _u: None) is None
    assert request_overlay(job, DEFAULT_PROFILE, DEFAULT_RESUME, bullets, ["python"], complete=lambda _s, _u: {"nope": True}) is None


def test_request_overlay_accepts_valid_draft():
    job = make_job(title="AI Engineer", company="Example Co", description="python n8n")
    bullets = select_bullets(DEFAULT_RESUME, job)
    role_id = DEFAULT_RESUME.experience[0].id

    def complete(_system: str, _user: str) -> dict:
        return {
            "summary": "Wayfair n8n work for Example Co.",
            "cover_letter": "Dear Example Co hiring team.",
            "bullets_by_experience_id": {role_id: ["At Wayfair I built n8n agents."]},
        }

    draft = request_overlay(job, DEFAULT_PROFILE, DEFAULT_RESUME, bullets, ["n8n"], complete=complete)
    assert draft is not None
    assert draft.cover_letter.startswith("Dear Example Co")
    assert role_id in draft.bullets_by_experience_id
