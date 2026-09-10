"""Seed profile and resume for Ethan Ignacio.

This is public resume-level information, not a dump of imported PDFs.
The TypeScript v1 stored the imported resume in .data/ (gitignored). This
file is the starting point for scoring until the settings page is saved.
"""

from __future__ import annotations

from app.models import (
    Profile,
    Resume,
    ResumeBasics,
    ResumeEducation,
    ResumeExperience,
    ResumeProject,
    ResumeSkillGroup,
)

DEFAULT_PROFILE = Profile(
    full_name="Ethan Ignacio",
    email="ethignacio25@gmail.com",
    phone="630-524-8692",
    location="Chicago, IL",
    headline="New-grad CS · AI engineering (agents, n8n, Gemini) · seeking data science and AI engineering roles",
    summary=(
        "Computer science student at UIC (expected May 2026) targeting new-grad "
        "data science and AI engineering roles. Strongest demonstrated work is "
        "AI agent engineering (Wayfair externship: n8n + Gemini). Classic data "
        "science depth (pandas, scikit-learn, experimentation) is still thin — "
        "score postings honestly against that, do not invent it."
    ),
    linkedin_url="https://www.linkedin.com/in/ethan-ignacio/",
    github_url="https://github.com/eignacio2",
    portfolio_url="",
    years_experience=0,
    experience_level="new-grad",
    max_years_required=2,
    include_internships=False,
    skills=[
        "Python",
        "SQL",
        "Java",
        "n8n",
        "Gemini",
        "LLM",
        "agents",
        "tool calling",
        "prompt engineering",
        "Git",
        "AWS",
        "FastAPI",
        "JavaScript",
        "REST API",
    ],
    target_titles=[
        "AI Engineer",
        "Machine Learning Engineer",
        "Data Scientist",
        "Data Scientist I",
        "Associate Data Scientist",
        "Junior Data Scientist",
        "ML Engineer",
        "New Grad Data Scientist",
        "New Grad Machine Learning Engineer",
    ],
    target_locations=["Remote (US)", "Chicago, IL", "New York, NY", "Seattle, WA"],
    remote_preference="any",
    min_salary=85000,
    excluded_companies=[],
    required_keywords=[],
    excluded_keywords=["unpaid", "commission only", "equity only"],
    auto_apply_threshold=72,
    daily_application_cap=10,
)

DEFAULT_RESUME = Resume(
    basics=ResumeBasics(
        name="Ethan Ignacio",
        title="New-grad CS · AI Engineer / Data Scientist",
        email="ethignacio25@gmail.com",
        phone="630-524-8692",
        location="Chicago, IL · Open to remote",
        links=[
            {"label": "LinkedIn", "url": "https://www.linkedin.com/in/ethan-ignacio/"},
            {"label": "GitHub", "url": "https://github.com/eignacio2"},
        ],
        summary=(
            "UIC computer science student (May 2026) with an AI Agent Engineering "
            "externship at Wayfair. Looking for a first full-time AI engineering "
            "or data science role. Comfortable wiring LLM tools into real workflows; "
            "not yet a production ML or experimentation hire."
        ),
    ),
    skill_groups=[
        ResumeSkillGroup(
            id="sk-languages",
            label="Languages",
            items=["Python", "SQL", "Java", "JavaScript"],
        ),
        ResumeSkillGroup(
            id="sk-ai",
            label="AI engineering",
            items=["n8n", "Gemini", "LLM", "agents", "tool calling", "prompt engineering"],
        ),
        ResumeSkillGroup(
            id="sk-tools",
            label="Tools",
            items=["Git", "AWS", "FastAPI", "REST API"],
        ),
    ],
    experience=[
        ResumeExperience(
            id="exp-wayfair",
            company="Wayfair",
            role="AI Agent Engineering Extern",
            location="Remote",
            start="2025",
            end="2025",
            bullets=[
                "Built LLM-backed agent workflows in n8n using Gemini to automate internal tasks that previously needed a human in the loop.",
                "Designed tool-calling steps and prompt structure so the agent could take actions rather than only generate text.",
                "Worked to production-adjacent constraints: the workflow had to run without a developer watching it.",
            ],
            stack=["n8n", "Gemini", "agents", "prompt engineering", "tool calling"],
        ),
    ],
    projects=[],
    education=[
        ResumeEducation(
            id="edu-uic",
            school="University of Illinois at Chicago",
            degree="B.S. Computer Science",
            start="2022",
            end="2026",
            detail="Expected May 2026. Coursework in software engineering and AI; targeting new-grad data science and AI engineering roles.",
        ),
    ],
    certifications=["AWS Certified Cloud Practitioner"],
)
