"""Two profiles live here, on purpose.

`DEFAULT_PROFILE` / `DEFAULT_RESUME` are Ethan — a complete example for
`python -m app load-demo` and for tests. A brand-new SQLite file is *not*
seeded as Ethan. `blank_profile()` is an empty candidate so someone else
cannot accidentally run his search.

Interview line: the engine is generic; Ethan is a fixture.
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
    headline="New-grad CS · AI Engineer / Forward Deployed Engineer (agents, n8n, Gemini)",
    summary=(
        "Computer science student at UIC (expected May 2026) targeting new-grad "
        "AI engineering and forward deployed engineering roles that are remote, "
        "hybrid, or on-site (Chicago is a plus, not a hard filter). Strongest demonstrated "
        "work is AI agent engineering (Wayfair externship: n8n + Gemini) — wiring LLM "
        "tools into real workflows with a customer-adjacent constraint. Not a classic "
        "data science hire (pandas/scikit-learn/experimentation are thin); do not invent that."
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
        "Associate AI Engineer",
        "Junior AI Engineer",
        "Forward Deployed Engineer",
        "Forward Deployed Software Engineer",
        "Forward Deployed AI Engineer",
        "Machine Learning Engineer",
        "Applied AI Engineer",
        "New Grad AI Engineer",
        "Customer Engineer",
    ],
    target_locations=[
        "Chicago, IL",
    ],
    remote_preference="hybrid",
    location_mode="remote-hybrid-onsite",
    min_salary=85000,
    excluded_companies=[],
    required_keywords=[],
    excluded_keywords=["unpaid", "commission only", "equity only"],
    auto_apply_threshold=72,
    daily_application_cap=10,
    autopilot_enabled=False,
    digest_email="ethignacio25@gmail.com",
)

DEFAULT_RESUME = Resume(
    basics=ResumeBasics(
        name="Ethan Ignacio",
        title="New-grad CS · AI Engineer / Forward Deployed Engineer",
        email="ethignacio25@gmail.com",
        phone="630-524-8692",
        location="Chicago, IL · Remote, hybrid, or on-site",
        links=[
            {"label": "LinkedIn", "url": "https://www.linkedin.com/in/ethan-ignacio/"},
            {"label": "GitHub", "url": "https://github.com/eignacio2"},
        ],
        summary=(
            "UIC computer science student (May 2026) with an AI Agent Engineering "
            "externship at Wayfair. Looking for a first full-time AI engineering "
            "or forward deployed engineering role (remote, hybrid, or on-site; Chicago is a plus). Comfortable wiring LLM tools into "
            "real workflows; not yet a production ML or experimentation hire."
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
            detail="Expected May 2026. Targeting new-grad AI engineering and forward deployed engineering roles.",
        ),
    ],
    certifications=["AWS Certified Cloud Practitioner"],
)

# Same objects, named for the CLI so "demo" is obvious in interview walkthroughs.
DEMO_PROFILE = DEFAULT_PROFILE
DEMO_RESUME = DEFAULT_RESUME


def blank_profile() -> Profile:
    """Empty candidate. Search is blocked until name, email, and titles are saved."""
    return Profile(
        full_name="",
        email="",
        phone="",
        location="",
        headline="",
        summary="",
        linkedin_url="",
        github_url="",
        years_experience=0,
        experience_level="new-grad",
        max_years_required=2,
        include_internships=False,
        skills=[],
        target_titles=[],
        target_locations=[],
        remote_preference="hybrid",
        location_mode="remote-hybrid-onsite",
        min_salary=None,
        excluded_companies=[],
        required_keywords=[],
        excluded_keywords=[],
        auto_apply_threshold=72,
        daily_application_cap=10,
        autopilot_enabled=False,
        digest_email="",
    )


def blank_resume() -> Resume:
    return Resume(
        basics=ResumeBasics(name="", title="", email="", phone="", location="", summary=""),
        skill_groups=[],
        experience=[],
        projects=[],
        education=[],
        certifications=[],
    )
