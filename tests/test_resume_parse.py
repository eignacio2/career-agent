from app.linkedin import DEMO_SNAPSHOT, generate_linkedin_pack, parse_linkedin_snapshot
from app.profile import DEFAULT_PROFILE, DEFAULT_RESUME
from app.resume_parse import parse_resume
from app.resume_render import render_resume_markdown
from tests.helpers import make_job

WAYFAIR_PLAIN = """
Ethan Ignacio
ethignacio25@gmail.com
630-524-8692
Chicago, IL

Summary
UIC computer science student with an AI Agent Engineering externship at Wayfair.

Skills
Python, SQL, n8n, Gemini

Experience
AI Agent Engineering Extern — Wayfair
Remote · 2025
- Built LLM-backed agent workflows in n8n using Gemini to automate internal tasks that previously needed a human in the loop.
- Designed tool-calling steps and prompt structure so the agent could take actions rather than only generate text.

Education
B.S. Computer Science — University of Illinois at Chicago (2022 – 2026)

Certifications
AWS Certified Cloud Practitioner
""".strip()


def test_parse_roundtrip_from_rendered_markdown():
    markdown = render_resume_markdown(DEFAULT_RESUME)
    parsed = parse_resume(markdown).resume
    assert parsed.basics.name == "Ethan Ignacio"
    assert parsed.basics.email == "ethignacio25@gmail.com"
    assert parsed.experience
    assert parsed.experience[0].company == "Wayfair"
    assert any("n8n" in bullet for bullet in parsed.experience[0].bullets)
    assert "AWS Certified Cloud Practitioner" in parsed.certifications
    assert any("Illinois" in entry.school for entry in parsed.education)


def test_parse_plain_text_keeps_wayfair():
    parsed = parse_resume(WAYFAIR_PLAIN).resume
    assert parsed.experience[0].company == "Wayfair"
    assert parsed.experience[0].role == "AI Agent Engineering Extern"
    assert len(parsed.experience[0].bullets) >= 2


def test_parse_does_not_invent_employers():
    text = """
Jane Doe
jane@example.com

Experience
Research assistant
- Cleaned a dataset for a class project.
"""
    parsed = parse_resume(text).resume
    companies = [role.company.lower() for role in parsed.experience]
    assert "wayfair" not in companies
    assert all(company != "acme" for company in companies)
    assert parsed.experience
    assert parsed.experience[0].bullets


def test_empty_paste_notes_and_blank_resume():
    result = parse_resume("   \n")
    assert not result.resume.experience
    assert any("empty" in note.lower() for note in result.notes)


def test_linkedin_snapshot_labeled_parse():
    snap = parse_linkedin_snapshot(
        "Headline: Student | Seeking Internship\n"
        "About: Growing up my family supported me.\n"
        "Skills: Microsoft Office, JavaFX\n"
        "Open to work: On-site\n"
        "Experience section: no\n"
        "Certifications section: no\n"
    )
    assert "Seeking" in snap.headline
    assert "family" in snap.about
    assert "Microsoft Office" in snap.skills
    assert snap.has_experience_section is False


def test_empty_snapshot_does_not_use_ethan_fixture():
    job = make_job(title="AI Engineer", tags=["python"], role_family="ai-engineering")
    pack = generate_linkedin_pack(DEFAULT_PROFILE, DEFAULT_RESUME, [job], None)
    currents = [change.current.lower() for change in pack.changes]
    assert not any("microsoft office" in current and "seeking" in current for current in currents)
    assert any("no snapshot" in change.current.lower() for change in pack.changes if change.field == "Headline")


def test_demo_snapshot_still_flags_weak_headline():
    job = make_job(title="AI Engineer", tags=["python", "sql"], role_family="ai-engineering")
    pack = generate_linkedin_pack(DEFAULT_PROFILE, DEFAULT_RESUME, [job], DEMO_SNAPSHOT)
    fields = {change.field for change in pack.changes}
    assert "Headline" in fields
    assert "seeking" not in pack.headline.lower()
