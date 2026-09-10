"""Bundled sample board used when live sources fail or CAREER_AGENT_OFFLINE=1.

These postings exist so scoring, the title filter, and the UI can be exercised
without the network. They are intentionally mixed: two genuine new-grad fits,
several 4+/5+ year roles that must be capped, a foreign on-site role, and an
adjacent analyst programme.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models import SourceJob
from app.sources.types import find_apply_email

SEEDS: list[dict] = [
    {
        "source_id": "sample-new-grad-ds",
        "title": "Data Scientist I (New Grad)",
        "company": "Rivermark Health",
        "location": "Remote (US)",
        "remote": True,
        "url": "https://example.com/rivermark/data-scientist-i-new-grad",
        "salary_text": "$95,000 - $115,000",
        "tags": ["python", "sql", "new-grad", "healthcare", "scikit-learn"],
        "days_ago": 1,
        "description": """This is a role for someone finishing a degree in statistics, data science, computer science, or a related field. We expect to teach you our domain; we do not expect you to arrive knowing it.

What you will do in your first year:
• Own a small forecasting or classification problem end to end, with a senior data scientist reviewing your work weekly.
• Write SQL against our claims warehouse and learn why the data is messier than any dataset you used in school.
• Build one or two internal dashboards that clinical operations actually uses daily.

Requirements:
• 0-2 years of professional experience. Internship and research experience counts.
• Bachelor's or Master's in a quantitative field.
• Solid Python (pandas, scikit-learn) and working SQL. You should be able to explain a train/test split and why it matters.

Send a resume and a link to any project you are proud of to newgrad-hiring@rivermark.example.""",
    },
    {
        "source_id": "sample-new-grad-ai-eng",
        "title": "Associate AI Engineer, University Graduate",
        "company": "Northgate Software",
        "location": "Chicago, IL (Hybrid)",
        "remote": False,
        "url": "https://example.com/northgate/associate-ai-engineer-university-graduate",
        "salary_text": "$105,000 - $125,000",
        "tags": ["python", "llm", "rag", "new-grad", "fastapi"],
        "days_ago": 2,
        "description": """Our university graduate programme places new engineers on the team building LLM features into our product. You will ship to production in your first month.

The work:
• Implement and evaluate retrieval pipelines: chunking, embedding, and the unglamorous work of figuring out why a specific query returns nothing useful.
• Write the evaluation cases that prove a prompt change helped rather than just felt better.
• Build FastAPI endpoints and the tests that keep them honest.

What we ask for:
• Graduating within the last year, or up to 1 year of professional experience.
• Strong Python. You have built something with an LLM API, even if only for a class or a side project.
• No prior industry ML experience required.

We deliberately do not ask for years of experience beyond this.""",
    },
    {
        "source_id": "sample-new-grad-fde",
        "title": "Forward Deployed Engineer, New Grad",
        "company": "Kestrel Applied",
        "location": "Chicago, IL",
        "remote": False,
        "url": "https://example.com/kestrel/forward-deployed-engineer-new-grad",
        "salary_text": "$120,000 - $145,000",
        "tags": ["python", "llm", "new-grad", "customer", "agents"],
        "days_ago": 1,
        "description": """New-graduate forward deployed engineers sit with customers and ship working AI workflows into their environment. You will not be a researcher; you will be the person who makes the product actually run.

The work:
• Embed with a customer team for a few weeks at a time, figure out where an LLM agent or retrieval pipeline would remove a real bottleneck, and ship it.
• Write Python glue, prompts, and evaluations so the workflow keeps working after you leave.
• Translate messy operational constraints back to the product team.

What we ask for:
• Graduating this year or up to 1 year of professional experience.
• Strong Python. You have built something with an LLM API, even if only for a class, intern, or externship.
• Comfort talking to non-engineers. This is a customer-facing engineering role, not a sales role.

Send a resume to newgrad@kestrel.example.""",
    },
    {
        "source_id": "sample-junior-mle",
        "title": "Junior Machine Learning Engineer",
        "company": "Halcyon Logistics",
        "location": "Denver, CO (Hybrid)",
        "remote": False,
        "url": "https://example.com/halcyon/junior-machine-learning-engineer",
        "salary_text": "$98,000 - $118,000",
        "tags": ["python", "ml", "docker", "junior", "aws"],
        "days_ago": 3,
        "description": """Join a four-person ML team supporting route optimisation and delivery time prediction.

Responsibilities:
• Maintain and retrain existing demand models under supervision, gradually taking full ownership.
• Containerise training jobs and move them onto our scheduled infrastructure.

Requirements:
• 1+ years of experience, including internships, or a relevant graduate degree.
• Python and one ML framework. Docker familiarity is a plus but we will teach it.
• Willing to be in our Denver office three days a week.

This is a genuinely junior role with a defined growth path to mid-level in about two years.""",
    },
    {
        "source_id": "sample-ai-eng-platform",
        "title": "AI Engineer, Retrieval Platform",
        "company": "Harborview AI",
        "location": "Remote (US)",
        "remote": True,
        "url": "https://example.com/harborview/ai-engineer-retrieval",
        "salary_text": "$185,000 - $225,000",
        "tags": ["python", "rag", "llm", "vector-search", "aws"],
        "days_ago": 1,
        "description": """We are hiring an AI Engineer to own the retrieval layer behind our customer-facing assistant.

What you will do:
• Design and tune hybrid retrieval (BM25 plus dense embeddings) over a multi-tenant corpus in pgvector.
• Build the evaluation harness that gates prompt and model changes.

What we look for:
• 4+ years writing production Python, including at least one LLM application in front of real users.
• Practical experience with RAG pipelines, embedding models, and vector databases.
• Comfort with AWS, Docker, and CI/CD.

Send a resume and a short note to careers@harborview.example.""",
    },
    {
        "source_id": "sample-senior-ds-forecasting",
        "title": "Senior Data Scientist, Demand Forecasting",
        "company": "Larkspur Logistics",
        "location": "Remote (US) or Chicago, IL",
        "remote": True,
        "url": "https://example.com/larkspur/senior-data-scientist-forecasting",
        "salary_text": "$170,000 - $200,000 + bonus",
        "tags": ["forecasting", "python", "airflow", "snowflake", "time-series"],
        "days_ago": 2,
        "description": """Larkspur moves freight for mid-market retailers. Our forecasts drive how many trucks we book six weeks out.

Requirements:
• 5+ years in applied data science with production ownership, not just analysis.
• Deep time series experience: hierarchical reconciliation, intermittent demand, holiday effects.
• Strong SQL and Snowflake; Python with pandas, statsmodels, and one modern forecasting library.""",
    },
    {
        "source_id": "sample-staff-mle",
        "title": "Staff Machine Learning Engineer",
        "company": "Ashgrove Research",
        "location": "Chicago, IL",
        "remote": False,
        "url": "https://example.com/ashgrove/staff-mle",
        "salary_text": "$240,000 - $290,000",
        "tags": ["ml", "python", "staff", "kubernetes"],
        "days_ago": 2,
        "description": """Lead the ML platform group. You will set technical direction for six engineers and own the model-serving SLA.

Requirements:
• 8+ years of machine learning engineering, including staff-level scope.
• Kubernetes, PyTorch, and a track record of leading without becoming a people-manager-only role.""",
    },
    {
        "source_id": "sample-london-mle",
        "title": "Machine Learning Engineer",
        "company": "Thames Analytics",
        "location": "London, United Kingdom",
        "remote": False,
        "url": "https://example.com/thames/machine-learning-engineer",
        "salary_text": "£75,000 - £95,000",
        "tags": ["python", "ml", "london"],
        "days_ago": 3,
        "description": """On-site ML engineer for our London office. You will train ranking models used by the UK marketplace.

Requirements:
• 2+ years of experience shipping ML models.
• Right to work in the United Kingdom is required; we cannot sponsor.""",
    },
    {
        "source_id": "sample-stuttgart-ds",
        "title": "Data Scientist",
        "company": "Neckar Mobility",
        "location": "Stuttgart, Germany",
        "remote": False,
        "url": "https://example.com/neckar/data-scientist",
        "salary_text": None,
        "tags": ["python", "sql", "automotive"],
        "days_ago": 5,
        "description": """On-site data scientist supporting manufacturing yield models at our Stuttgart plant.

Requirements:
• 3+ years of applied data science.
• German language is a plus. This role cannot be done remotely.""",
    },
    {
        "source_id": "sample-early-analyst",
        "title": "Data Analyst, Early Career Program",
        "company": "Pinehurst Financial",
        "location": "Remote (US)",
        "remote": True,
        "url": "https://example.com/pinehurst/data-analyst-early-career",
        "salary_text": "$78,000 - $92,000",
        "tags": ["sql", "analytics", "python", "early-career", "tableau"],
        "days_ago": 4,
        "description": """A two-year rotational programme for recent graduates, moving through three analytics teams: risk, marketing, and operations.

What we need:
• Recent graduate, or up to 2 years of experience.
• Strong SQL and spreadsheet skills; Python is a plus rather than a requirement.

We do not require finance coursework or prior industry experience.""",
    },
    {
        "source_id": "sample-new-grad-swe",
        "title": "Software Engineer, University Graduate",
        "company": "Palantir-shaped Example",
        "location": "New York, NY",
        "remote": False,
        "url": "https://example.com/example/swe-university-graduate",
        "salary_text": "$135,000 - $155,000",
        "tags": ["java", "new-grad"],
        "days_ago": 1,
        "description": """New-graduate software engineer programme. You will ship product features on a backend team. This is not a machine learning or data science role.

Requirements:
• Graduating within the year.
• Strong coding; Java or C++ preferred.""",
    },
    {
        "source_id": "sample-office-assistant",
        "title": "Office Assistant — AI Lab Admin",
        "company": "Harborview AI",
        "location": "Chicago, IL",
        "remote": False,
        "url": "https://example.com/harborview/office-assistant",
        "salary_text": "$42,000",
        "tags": ["admin", "office"],
        "days_ago": 2,
        "description": """Schedule meetings for the AI lab, order supplies, and greet visitors. Mentions agents and prompts only because that is what the lab works on.""",
    },
    {
        "source_id": "sample-ds-experimentation",
        "title": "Data Scientist, Experimentation",
        "company": "Perch Financial",
        "location": "Remote (US)",
        "remote": True,
        "url": "https://example.com/perch/data-scientist-experimentation",
        "salary_text": "$155,000 - $180,000",
        "tags": ["experimentation", "causal-inference", "sql", "python"],
        "days_ago": 4,
        "description": """Perch is a consumer lending platform. Our experimentation practice is young and needs someone to make it rigorous.

What we need:
• 3+ years in a data science role where you owned experiment design, not just readouts.
• Genuine statistical depth: you can explain why a peeking correction matters to a skeptical PM.
• Strong SQL, Python, and dbt.""",
    },
]


class SampleSource:
    id = "sample-board"
    label = "Sample board (offline fallback)"
    requires_network = False

    def fetch(self, queries: list[str], limit: int) -> list[SourceJob]:  # noqa: ARG002
        jobs: list[SourceJob] = []
        now = datetime.now(timezone.utc)
        for seed in SEEDS[: max(limit, 1)]:
            jobs.append(
                SourceJob(
                    source=self.id,
                    source_id=seed["source_id"],
                    title=seed["title"],
                    company=seed["company"],
                    location=seed["location"],
                    remote=seed["remote"],
                    url=seed["url"],
                    apply_email=find_apply_email(seed["description"]),
                    description=seed["description"],
                    salary_text=seed["salary_text"],
                    tags=list(seed["tags"]),
                    posted_at=(now - timedelta(days=seed["days_ago"])).isoformat(),
                    early_career="new-grad" in seed["title"].lower()
                    or "new grad" in seed["title"].lower()
                    or "university graduate" in seed["title"].lower()
                    or "early career" in seed["title"].lower()
                    or "junior" in seed["title"].lower(),
                )
            )
        return jobs
