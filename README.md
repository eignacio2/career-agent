# Career Agent

Python job-search agent. The bundled demo candidate is a **new-grad AI Engineer / Forward Deployed Engineer**; the title filter follows whatever target titles are on the profile.

It discovers postings, keeps titles that match those targets, keeps **remote, hybrid, and on-site roles in any city**, scores them with year-requirement **caps** (not penalties), tailors a resume and cover letter from bullets you already have, emails an application when the posting lists an address, and otherwise prepares a pack for you to submit on Greenhouse/Lever/Workday. It writes a daily digest and a LinkedIn copy-paste pack. **It does not fill ATS forms.**

The demo profile does not list Data Scientist, so those titles are classified and dropped. Put Data Scientist on the profile and they are kept. Generic Software Engineer matches by phrase only, so it does not pull in every analyst programme.

## Resume bullets you can actually defend

- Built a Python agent that discovers postings from public boards plus company career APIs, title-filters against the candidate’s target roles, keeps remote/hybrid/on-site roles (Chicago is a scoring boost, not a hard drop), and scores fit with a cap so a 5+ years role cannot clear a 72 apply threshold.
- Tailors a markdown resume and cover letter by reordering existing bullets (never invents employers or metrics); emails applications when a posting lists an address, otherwise queues an ATS pack for manual submit.
- Writes a daily digest and a field-by-field LinkedIn update pack (headline/About/skills). LinkedIn is copy-paste; there is no unofficial write API.

## First-time setup

A new database starts **empty**. The agent will not search until the profile has a name, an email, and at least one target title. That is so cloning this repo does not silently run Ethan Ignacio's search.

```bash
python3 -m app status           # tells you what is missing
# Fill the Profile page in the viewer, or load the bundled example:
python3 -m app load-demo        # Ethan Ignacio, AI Engineer / FDE
python3 -m app load-resume path.txt   # optional: parse your resume text
python3 -m app load-linkedin path.txt # optional: store a LinkedIn snapshot
python3 -m app run
```

`load-demo` overwrites the candidate in *this* SQLite file. Use it for interviews and for trying the pipeline; use the Profile page when the candidate is someone else.

## Run it

Live boards first. `--offline` is only for tests and for explaining caps with known fixtures.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python3 -m app run              # live boards (not --offline)
python3 -m app queued           # real postings that cleared 72
python3 -m app applications
python3 -m app digest
python3 -m app linkedin
python3 -m app status
pytest
```

If every live board is down, the same command falls back to the sample board. Force that with `python3 -m app run --offline`.

Daily cron (no web server required):

```bash
0 13 * * * cd /path/to/career-agent && .venv/bin/python -m app run >> /tmp/career-agent.log 2>&1
```

Optional viewer: `uvicorn app.main:app --host 127.0.0.1 --port 43421`

## Job boards

Public JSON only. No LinkedIn/Indeed scrape, no API keys.

| Source | What it is good for |
| --- | --- |
| New Grad Positions (SimplifyJobs) | Actual new-grad / university listings |
| Remotive, Arbeitnow, RemoteOK, Jobicy, Himalayas | Remote aggregators |
| Palantir (Lever) | Forward Deployed Engineer postings |
| Anduril, Anthropic, Scale AI (Greenhouse) | Defense / AI lab career pages |
| OpenAI, Harvey (Ashby) | AI product career pages |

Boards that need a key or that 401 without login (Hugging Face jobs, most ATS search APIs) are left out on purpose.

## Location filter

Default (`location_mode=remote-hybrid-onsite`): **remote, hybrid, or on-site, any city**. A posting with no location string is kept (unknown arrangement), not dropped. Scoring still boosts target cities (Chicago on the demo profile) and gives remote full location points. Foreign on-site is **not** pre-filtered; the scorer caps it at 50.

Opt-in `location_mode=chicago-office` is the old Chicago office/hybrid hard filter. `location_mode=any` turns the hard filter off entirely (same inclusion as the default, different log wording).

`work_arrangement` and `location_allowed` live in `app/geo.py`.

## Title filter

The allowlist is `profile.target_titles`, not a hardcoded AI Eng / FDE set. A posting is kept when the title phrase matches a target, or when it is in the same expandable family (AI engineering, forward deployed, data science). Adjacent titles such as Software Engineer match by phrase only.

`is_plausible_target` lives in `app/sources/filter.py`.

## Resume paste and LinkedIn snapshot

The stored resume is what tailoring reorders. Paste text on the Profile page or `python -m app load-resume file.txt`. The parser extracts employers and bullets that appear in the paste; it will not invent a company if the paste omitted one.

The LinkedIn pack diffs against a **snapshot you paste** (headline / About / skills / open-to-work), not against a live profile. A LinkedIn URL is stored only — never fetched. `python -m app load-linkedin file.txt` accepts a labeled dump. `load-demo` installs Ethan’s known public snapshot so the interview pack has specific diffs.

## What happens in one run

```
discover → title filter → location filter → SQLite dedupe → score (caps) → tailor
       → email if apply address + autopilot, else pack for you
       → LinkedIn pack → digest.md (+ SMTP if configured)
```

Autopilot is **off** by default. Packs land in `.data/applications/<id>/`. Mail without SMTP lands in `.data/outbox/`. Digests land in `.data/digests/`.

Set `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` to actually send. Set `autopilot_enabled` on the profile only if you want email applications sent unattended.

## Tests that matter in an interview

- `tests/test_extract_years.py` — `4+ years` counts; “past 5 years” does not
- `tests/test_score.py` — new-grad AI Engineer / FDE clears 72; 5+ years senior is capped below it
- `tests/test_filter.py` — Ethan’s titles drop Data Scientist and Office Assistant; a Data Scientist profile keeps DS titles
- `tests/test_location.py` — remote, Denver hybrid, and London on-site are kept; chicago-office mode still drops Remote (US) and NYC
- `tests/test_tailor.py` — tailored resume still contains Wayfair, never invents employers
- `tests/test_resume_parse.py` — Wayfair survives a paste; empty snapshot does not fall back to Ethan’s LinkedIn
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
app/geo.py            location allow / deny
app/scoring/score.py  heuristic scorer
app/tailor.py         resume / cover letter
app/apply.py          email vs ATS pack
app/digest.py         daily markdown
app/resume_parse.py   paste → structured resume
app/linkedin.py       copy-paste pack + snapshot parse
app/db.py             SQLite
app/main.py           optional FastAPI viewer
tests/
```
