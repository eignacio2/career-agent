# Career Agent

A personal job-search agent for **new-grad data science and AI engineering** roles.

It discovers postings, drops anything that is not in-family from the title alone, scores what remains against your profile, and queues roles that clear your threshold. **You still submit the application.** Automated form-filling on Greenhouse/Lever/Workday/Easy Apply is out of scope (and against most ToS).

This is a Python rewrite of an earlier TypeScript/Next.js version. The old tree is in git history (`21f5da9` on `main` before this commit). This slice does **not** tailor resumes, send email, import PDFs, or write LinkedIn copy.

## What it does

1. **Discover** — New Grad Positions board (SimplifyJobs), Remotive, Arbeitnow. If they fail, or you set `CAREER_AGENT_OFFLINE=1`, it uses a bundled sample board.
2. **Pre-filter** — Title allowlist for DS / AI engineering / adjacent analytics. Internships are off by default. Body text is ignored here on purpose.
3. **Score** — Heuristic only. Weights: title 30, skills 24, level 22, location 16, salary 6, family ±14. Years over-reach, staff titles, and foreign on-site work **cap** the score so they cannot clear the queue threshold.
4. **Queue** — Status `queued` means “go apply.” `skipped` is kept so you can audit the caps.

## Run locally

Python 3.12+.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# optional: copy .env.example to .env

uvicorn app.main:app --host 127.0.0.1 --port 43421 --reload
```

Open http://127.0.0.1:43421

On the dashboard, check **Use sample board only** for the first run so you can see scoring without live APIs.

### Tests

```bash
pytest
```

The tests that matter most:

- `tests/test_extract_years.py` — `4+ years` without the word “experience” still counts; “past 5 years” does not.
- `tests/test_score.py` — a new-grad DS I clears 72; a 5+ years senior role is capped below it.
- `tests/test_filter.py` — Office Assistant never reaches the scorer.
- `tests/test_pipeline.py` — one full offline run against SQLite.

### Daily cron

```bash
APP_URL=http://127.0.0.1:43421 ./scripts/run_daily.sh
```

Set `CRON_SECRET` if you expose the process beyond localhost. HTML routes are **not** authenticated in this slice.

## Profile

Defaults are Ethan Ignacio’s public new-grad targeting (UIC CS, May 2026; Wayfair AI agent externship). Edit **Profile** in the UI. Do not invent pandas/scikit-learn experience the resume does not have — the scorer will then over-rank classic DS postings.

## What this is not

- Not an autopilot. Queued ≠ submitted.
- Not a LinkedIn writer. LinkedIn has no official write API for this.
- Not production-hardened. Cron is the only gated route. SQLite lives in `.data/`. This process is a long-running server, not a serverless deploy.

## Layout

```
app/models.py          SourceJob, Job, Profile
app/sources/filter.py  title allowlist
app/sources/           board adapters + discover()
app/scoring/score.py   heuristic scorer
app/db.py              SQLite
app/pipeline.py        one run
app/main.py            FastAPI + Jinja
tests/                 pytest
```

Read **How it works** in the app (`/concepts`) for why each layer exists.
