import { findApplyEmail, type JobSource, type SourceJob } from "./types";

interface Seed {
  sourceId: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  url: string;
  salaryText: string | null;
  tags: string[];
  daysAgo: number;
  description: string;
}

/**
 * Used when the live boards are unreachable (offline dev, restricted egress) so
 * the pipeline, scoring, and digest are all exercisable end to end.
 */
const SEEDS: Seed[] = [
  {
    sourceId: "sample-ai-eng-platform",
    title: "AI Engineer, Retrieval Platform",
    company: "Harborview AI",
    location: "Remote (US)",
    remote: true,
    url: "https://example.com/harborview/ai-engineer-retrieval",
    salaryText: "$185,000 - $225,000",
    tags: ["python", "rag", "llm", "vector-search", "aws"],
    daysAgo: 1,
    description: `We are hiring an AI Engineer to own the retrieval layer behind our customer-facing assistant, which answers roughly 40,000 questions a day against a corpus of technical documentation.

What you will do:
• Design and tune hybrid retrieval (BM25 plus dense embeddings) over a multi-tenant corpus in pgvector.
• Build the evaluation harness that gates prompt and model changes: faithfulness, retrieval recall, latency budgets.
• Ship guardrails and output validation so the assistant declines rather than hallucinates.
• Partner with platform engineering on inference cost, caching, and autoscaling.

What we look for:
• 4+ years writing production Python, including at least one LLM application in front of real users.
• Practical experience with RAG pipelines, embedding models, and vector databases.
• Comfort with AWS, Docker, and CI/CD; you should be able to deploy your own service.
• Bonus: fine-tuning experience (LoRA or full), or prior work on evaluation tooling.

Send a resume and a short note about a retrieval system you have debugged to careers@harborview.example.`,
  },
  {
    sourceId: "sample-senior-ds-forecasting",
    title: "Senior Data Scientist, Demand Forecasting",
    company: "Larkspur Logistics",
    location: "Remote (US) or Chicago, IL",
    remote: true,
    url: "https://example.com/larkspur/senior-data-scientist-forecasting",
    salaryText: "$170,000 - $200,000 + bonus",
    tags: ["forecasting", "python", "airflow", "snowflake", "time-series"],
    daysAgo: 2,
    description: `Larkspur moves freight for mid-market retailers. Our forecasts drive how many trucks we book six weeks out, so accuracy is money.

Responsibilities:
• Own the SKU and lane level demand forecast end to end: feature engineering, model selection, backtesting, deployment, monitoring.
• Replace the current gradient-boosted baseline where a hierarchical or neural approach earns its complexity, and document when it does not.
• Run the weekly forecast review with supply chain leadership and translate error into operational decisions.
• Improve the Airflow retraining pipeline and the MLflow tracking discipline around it.

Requirements:
• 5+ years in applied data science with production ownership, not just analysis.
• Deep time series experience: hierarchical reconciliation, intermittent demand, holiday effects.
• Strong SQL and Snowflake; Python with pandas, statsmodels, and one modern forecasting library.
• Experience communicating uncertainty to non-technical stakeholders without hiding behind intervals.`,
  },
  {
    sourceId: "sample-mle-ranking",
    title: "Machine Learning Engineer, Ranking",
    company: "Fernwood Commerce",
    location: "New York, NY (Hybrid, 2 days onsite)",
    remote: false,
    url: "https://example.com/fernwood/mle-ranking",
    salaryText: "$190,000 - $230,000",
    tags: ["ranking", "pytorch", "kubernetes", "recsys"],
    daysAgo: 3,
    description: `Own search and recommendation ranking for a marketplace with 12 million monthly buyers.

You will:
• Train and ship learning-to-rank models against click and conversion objectives, with counterfactual evaluation before every A/B test.
• Reduce p99 inference latency on a Kubernetes-hosted serving path currently sitting at 180ms.
• Build the feature pipeline contract between offline training and online serving so training/serving skew stops being a weekly fire.
• Design the experiment, not just the model: guardrail metrics, interference, and long-term holdouts.

You should have:
• 4+ years of ML engineering with recommender or search ranking systems in production.
• Strong PyTorch, plus real comfort with Kubernetes, gRPC, and observability tooling.
• A track record of experiments that shipped and experiments you killed.

This role is hybrid in our Manhattan office two days a week; we are not able to sponsor fully remote arrangements.`,
  },
  {
    sourceId: "sample-applied-scientist-llm",
    title: "Applied Scientist, LLM Evaluation",
    company: "Ashgrove Research",
    location: "Remote (Global)",
    remote: true,
    url: "https://example.com/ashgrove/applied-scientist-llm-eval",
    salaryText: "$200,000 - $250,000",
    tags: ["llm", "evaluation", "research", "python"],
    daysAgo: 1,
    description: `Ashgrove builds evaluation infrastructure for teams deploying language models in regulated industries. We are hiring an applied scientist to lead our rubric-based grading research.

The work:
• Develop and validate LLM-as-judge methods, including inter-rater agreement studies against human annotators.
• Quantify and reduce grader bias: position effects, verbosity preference, self-preference across model families.
• Publish internal reports that our customers' risk teams can actually audit.
• Contribute to the open-source evaluation harness that anchors our developer community.

Ideal background:
• Graduate degree in statistics, CS, or a quantitative field, or equivalent applied research experience.
• Published or shipped work on model evaluation, annotation quality, or measurement validity.
• Fluent Python; comfortable reading and reimplementing recent papers.
• Clear technical writing is a hard requirement for this role.

Apply with a resume and a writing sample to research-hiring@ashgrove.example.`,
  },
  {
    sourceId: "sample-ds-experimentation",
    title: "Data Scientist, Experimentation",
    company: "Perch Financial",
    location: "Remote (US)",
    remote: true,
    url: "https://example.com/perch/data-scientist-experimentation",
    salaryText: "$155,000 - $180,000",
    tags: ["experimentation", "causal-inference", "sql", "python"],
    daysAgo: 4,
    description: `Perch is a consumer lending platform. Our experimentation practice is young and needs someone to make it rigorous.

What you will own:
• The experimentation platform's statistical engine: sequential testing, variance reduction (CUPED), and power analysis tooling.
• Causal inference for cases we cannot randomize: difference-in-differences, synthetic control, instrumental variables.
• Reviewing experiment designs across product teams and saying no when a test cannot answer the question asked.
• The metrics layer in dbt that everyone else's analysis depends on.

What we need:
• 3+ years in a data science role where you owned experiment design, not just readouts.
• Genuine statistical depth: you can explain why a peeking correction matters to a skeptical PM.
• Strong SQL, Python, and dbt. Experience in a regulated environment is a plus.`,
  },
  {
    sourceId: "sample-ai-eng-agents",
    title: "AI Engineer, Agent Infrastructure",
    company: "Kestrel Labs",
    location: "Remote (US/EU)",
    remote: true,
    url: "https://example.com/kestrel/ai-engineer-agents",
    salaryText: "$180,000 - $215,000 + equity",
    tags: ["agents", "llm", "typescript", "python", "observability"],
    daysAgo: 2,
    description: `We build agent infrastructure for engineering teams: tool calling, sandboxed execution, and the tracing layer that makes multi-step runs debuggable.

You will:
• Design tool-calling interfaces and retry semantics that survive flaky downstream APIs.
• Build the tracing and replay system so a failed 40-step run can be reproduced deterministically.
• Own token and cost budgeting across long-horizon tasks.
• Write the eval suites that catch agent regressions before customers do.

Requirements:
• 4+ years of backend or ML engineering, with at least a year on LLM-backed systems.
• Strong Python or TypeScript; you will use both here.
• Deep debugging instincts for nondeterministic systems.
• Experience with observability tooling (OpenTelemetry, structured tracing).`,
  },
  {
    sourceId: "sample-ds-healthcare",
    title: "Data Scientist, Clinical Risk Models",
    company: "Brightmoor Health",
    location: "Boston, MA (Onsite)",
    remote: false,
    url: "https://example.com/brightmoor/data-scientist-clinical-risk",
    salaryText: "$145,000 - $170,000",
    tags: ["healthcare", "python", "risk-models", "sql"],
    daysAgo: 6,
    description: `Build and validate risk models used by care management teams across 14 hospitals.

Responsibilities:
• Develop readmission and deterioration risk models on EHR data, with fairness auditing across payer and demographic groups.
• Own model documentation for clinical governance review.
• Work directly with nurses and care managers to design the alert thresholds they will actually act on.
• Monitor deployed models for drift as coding practices change.

Requirements:
• 3+ years applied modeling experience, ideally with clinical or claims data.
• Python, SQL, and a real understanding of calibration versus discrimination.
• Comfort with HIPAA constraints and the slower pace of clinical validation.

This position is onsite in Boston five days a week.`,
  },
  {
    sourceId: "sample-llm-eng-fintech",
    title: "LLM Engineer, Document Intelligence",
    company: "Marlowe Capital Systems",
    location: "Remote (US)",
    remote: true,
    url: "https://example.com/marlowe/llm-engineer-document-intelligence",
    salaryText: "$175,000 - $210,000",
    tags: ["llm", "nlp", "document-ai", "python", "fastapi"],
    daysAgo: 3,
    description: `Extract structured data from credit agreements, indentures, and loan documents at scale.

The problem:
• Documents are 200+ pages, inconsistently formatted, and legally load-bearing. A wrong covenant extraction is a real financial risk.
• We need extraction with calibrated confidence, human-in-the-loop review routing, and a full audit trail.

You will:
• Build extraction pipelines combining layout-aware parsing with LLM structured output.
• Design the confidence estimation that decides what a human reviews.
• Ship FastAPI services and the batch pipelines that feed them.
• Own accuracy metrics per field type and drive them up quarter over quarter.

Requirements:
• 4+ years Python; production LLM or NLP experience required.
• Structured output extraction with schema validation (Pydantic, JSON schema, constrained decoding).
• Bonus: financial document domain knowledge, or OCR and document layout experience.`,
  },
  {
    sourceId: "sample-mlops-platform",
    title: "MLOps Engineer, Model Platform",
    company: "Solstice Data",
    location: "Remote (US)",
    remote: true,
    url: "https://example.com/solstice/mlops-engineer",
    salaryText: "$165,000 - $195,000",
    tags: ["mlops", "kubernetes", "terraform", "mlflow", "python"],
    daysAgo: 5,
    description: `Own the platform that 30 data scientists deploy on.

Scope:
• Training orchestration (Airflow plus Kubernetes), model registry (MLflow), and the deployment path to online serving.
• Reduce time-to-production for a new model from three weeks to under one.
• Cost visibility per team, per model, per training run.
• On-call for the serving tier, with a real error budget.

Requirements:
• 4+ years infrastructure or platform engineering, with ML workloads specifically.
• Kubernetes and Terraform in anger, not just in tutorials.
• Python strong enough to review a data scientist's training code and improve it.
• Bonus: feature store implementation experience.`,
  },
  {
    sourceId: "sample-new-grad-ds",
    title: "Data Scientist I (New Grad)",
    company: "Rivermark Health",
    location: "Remote (US)",
    remote: true,
    url: "https://example.com/rivermark/data-scientist-i-new-grad",
    salaryText: "$95,000 - $115,000",
    tags: ["python", "sql", "new-grad", "healthcare", "scikit-learn"],
    daysAgo: 1,
    description: `This is a role for someone finishing a degree in statistics, data science, computer science, or a related field. We expect to teach you our domain; we do not expect you to arrive knowing it.

What you will do in your first year:
• Own a small forecasting or classification problem end to end, with a senior data scientist reviewing your work weekly.
• Write SQL against our claims warehouse and learn why the data is messier than any dataset you used in school.
• Build one or two internal dashboards that clinical operations actually uses daily.
• Present findings to non-technical stakeholders, with coaching on how to do it well.

Requirements:
• 0-2 years of professional experience. Internship and research experience counts.
• Bachelor's or Master's in a quantitative field.
• Solid Python (pandas, scikit-learn) and working SQL. You should be able to explain a train/test split and why it matters.
• Genuine curiosity and the willingness to say "I do not know yet."

We hire new graduates every cycle and have a structured onboarding programme with a named mentor for your first six months.

Send a resume and a link to any project you are proud of to newgrad-hiring@rivermark.example.`,
  },
  {
    sourceId: "sample-new-grad-ai-eng",
    title: "Associate AI Engineer, University Graduate",
    company: "Northgate Software",
    location: "Remote (US) or Austin, TX",
    remote: true,
    url: "https://example.com/northgate/associate-ai-engineer-university-graduate",
    salaryText: "$105,000 - $125,000",
    tags: ["python", "llm", "rag", "new-grad", "fastapi"],
    daysAgo: 2,
    description: `Our university graduate programme places new engineers on the team building LLM features into our product. You will ship to production in your first month.

The work:
• Implement and evaluate retrieval pipelines: chunking, embedding, and the unglamorous work of figuring out why a specific query returns nothing useful.
• Write the evaluation cases that prove a prompt change helped rather than just felt better.
• Build FastAPI endpoints and the tests that keep them honest.
• Pair regularly with senior engineers; roughly a third of your first six months is structured learning.

What we ask for:
• Graduating within the last year, or up to 1 year of professional experience.
• Strong Python. You have built something with an LLM API, even if only for a class or a side project.
• Comfort reading documentation and debugging without a clear answer available.
• No prior industry ML experience required.

We deliberately do not ask for years of experience beyond this. Candidates from bootcamps and non-traditional paths are welcome if the code is there.`,
  },
  {
    sourceId: "sample-new-grad-mle",
    title: "Junior Machine Learning Engineer",
    company: "Halcyon Logistics",
    location: "Denver, CO (Hybrid)",
    remote: false,
    url: "https://example.com/halcyon/junior-machine-learning-engineer",
    salaryText: "$98,000 - $118,000",
    tags: ["python", "ml", "docker", "junior", "aws"],
    daysAgo: 3,
    description: `Join a four-person ML team supporting route optimisation and delivery time prediction.

Responsibilities:
• Maintain and retrain existing demand models under supervision, gradually taking full ownership.
• Containerise training jobs and move them onto our scheduled infrastructure.
• Write monitoring that tells us when a model has drifted before a customer notices.
• Contribute to code review; we expect junior engineers to ask hard questions.

Requirements:
• 1+ years of experience, including internships, or a relevant graduate degree.
• Python and one ML framework. Docker familiarity is a plus but we will teach it.
• Willing to be in our Denver office three days a week.

This is a genuinely junior role with a defined growth path to mid-level in about two years.`,
  },
  {
    sourceId: "sample-new-grad-analyst",
    title: "Data Analyst, Early Career Program",
    company: "Pinehurst Financial",
    location: "Remote (US)",
    remote: true,
    url: "https://example.com/pinehurst/data-analyst-early-career",
    salaryText: "$78,000 - $92,000",
    tags: ["sql", "analytics", "python", "early-career", "tableau"],
    daysAgo: 4,
    description: `A two-year rotational programme for recent graduates, moving through three analytics teams: risk, marketing, and operations.

What you get:
• Rotations every eight months, so you leave knowing which kind of analytics work you actually enjoy.
• A dedicated mentor and a cohort of other early-career analysts.
• A conversion conversation at the end of the programme, with most participants placed into a permanent role.

What we need:
• Recent graduate, or up to 2 years of experience.
• Strong SQL and spreadsheet skills; Python is a plus rather than a requirement.
• Clear written communication. A lot of this job is explaining a number to someone who did not ask for it.

We do not require finance coursework or prior industry experience.`,
  },
  {
    sourceId: "sample-junior-analyst",
    title: "Marketing Data Analyst (Entry Level)",
    company: "Tidewater Media",
    location: "Remote (US)",
    remote: true,
    url: "https://example.com/tidewater/marketing-data-analyst",
    salaryText: "$62,000 - $75,000",
    tags: ["analytics", "sql", "excel", "marketing"],
    daysAgo: 7,
    description: `Support the marketing team with campaign reporting and dashboard maintenance.

Responsibilities:
• Build weekly campaign performance reports in Looker.
• Maintain UTM taxonomy and audit tracking implementation.
• Pull ad-hoc lists for the lifecycle marketing team.
• Assist with attribution reporting.

Requirements:
• 0-2 years experience. Bachelor's degree preferred.
• Intermediate SQL and strong spreadsheet skills.
• Interest in marketing analytics.

This is an entry-level individual contributor role reporting to the Director of Growth.`,
  },
];

export const offlineSource: JobSource = {
  id: "sample-board",
  label: "Sample board (offline fallback)",
  requiresNetwork: false,

  async fetch(_queries, limit) {
    return SEEDS.slice(0, Math.max(limit, 1)).map<SourceJob>((seed) => ({
      source: "sample-board",
      sourceId: seed.sourceId,
      title: seed.title,
      company: seed.company,
      location: seed.location,
      remote: seed.remote,
      url: seed.url,
      applyEmail: findApplyEmail(seed.description),
      description: seed.description,
      salaryText: seed.salaryText,
      tags: seed.tags,
      postedAt: new Date(Date.now() - seed.daysAgo * 86_400_000).toISOString(),
    }));
  },
};
