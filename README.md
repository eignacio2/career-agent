# Career Agent

Python job-search agent for **new-grad data science and AI engineering** roles.

It discovers postings, drops anything that is not in-family from the title, scores them with year-requirement **caps** (not penalties), tailors a resume and cover letter from bullets you already have, emails an application when the posting lists an address, and otherwise prepares a pack for you to submit on Greenhouse/Lever/Workday. It writes a daily digest and a LinkedIn copy-paste pack. **It does not fill ATS forms.**

## Resume bullets you can actually defend

- Built a Python agent that discovers new-grad DS/AI postings from public boards, title-filters noise, and scores fit with a cap so a 5+ years role cannot clear a 72 apply threshold.
- Tailors a markdown resume and cover letter by reordering existing bullets (never invents employers or metrics); emails applications when a posting lists an address, otherwise queues an ATS pack for manual submit.
- Writes a daily digest and a field-by-field LinkedIn update pack (headline/About/skills). LinkedIn is copy-paste; there is no unofficial write API.

## Run it (this is the interview demo)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python3 -m app run --offline    # sample board, no network
python3 -m app queued           # what to apply to
python3 -m app applications    # tailored packs on disk
python3 -m app digest           # today's digest
python3 -m app linkedin         # copy-paste pack
python3 -m app status
pytest
```

Live boards (New Grad Positions, Remotive, Arbeitnow):

```bash
python -m app run
```

Daily cron (no web server required):

```bash
0 13 * * * cd /path/to/career-agent && .venv/bin/python -m app run >> /tmp/career-agent.log 2>&1
```

Optional viewer: `uvicorn app.main:app --host 127.0.0.1 --port 43421`

## What happens in one run

```
discover → title filter → SQLite dedupe → score (caps) → tailor
       → email if apply address + autopilot, else pack for you
       → LinkedIn pack → digest.md (+ SMTP if configured)
```

Autopilot is **off** by default. Packs land in `.data/applications/<id>/`. Mail without SMTP lands in `.data/outbox/`. Digests land in `.data/digests/`.

Set `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` to actually send. Set `autopilot_enabled` on the profile only if you want email applications sent unattended.

## Tests that matter in an interview

- `tests/test_extract_years.py` — `4+ years` counts; “past 5 years” does not
- `tests/test_score.py` — new-grad DS I clears 72; 5+ years senior is capped below it
- `tests/test_filter.py` — Office Assistant never reaches the scorer
- `tests/test_tailor.py` — tailored resume still contains Wayfair, never invents employers
- `tests/test_linkedin.py` — headline drops “seeking internship” / Microsoft Office
- `tests/test_cli.py` — `python -m app run --offline` is the product

## Walkthrough files (open these, not the templates)

1. `app/pipeline.py` — one run
2. `app/sources/filter.py` — title allowlist
3. `app/scoring/score.py` — weights and caps
4. `app/tailor.py` — reorder, do not invent
5. `tests/test_score.py` — proof

See `INTERVIEW.md` for the 15-minute script.

## Layout

```
app/pipeline.py       one run
app/cli.py            python -m app
app/sources/          boards + title filter
app/scoring/score.py  heuristic scorer
app/tailor.py         resume / cover letter
app/apply.py          email vs ATS pack
app/digest.py         daily markdown
app/linkedin.py       copy-paste pack
app/db.py             SQLite
app/main.py           optional FastAPI viewer
tests/
```
