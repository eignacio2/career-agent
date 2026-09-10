# Career Agent

Python job-search agent for **new-grad AI Engineer and Forward Deployed Engineer** roles.

It discovers postings, drops anything that is not AI engineering or forward-deployed from the title, applies a **location filter** (US on-site or remote by default), scores them with year-requirement **caps** (not penalties), tailors a resume and cover letter from bullets you already have, emails an application when the posting lists an address, and otherwise prepares a pack for you to submit on Greenhouse/Lever/Workday. It writes a daily digest and a LinkedIn copy-paste pack. **It does not fill ATS forms.**

Classic data-science titles (Data Scientist, statistician, quant) are classified but **not queued**. Adjacent SWE / analyst programmes are dropped the same way.

## Resume bullets you can actually defend

- Built a Python agent that discovers new-grad AI Engineer and Forward Deployed Engineer postings from public boards plus company career APIs, title-filters noise, hard-filters foreign on-site roles, and scores fit with a cap so a 5+ years role cannot clear a 72 apply threshold.
- Tailors a markdown resume and cover letter by reordering existing bullets (never invents employers or metrics); emails applications when a posting lists an address, otherwise queues an ATS pack for manual submit.
- Writes a daily digest and a field-by-field LinkedIn update pack (headline/About/skills). LinkedIn is copy-paste; there is no unofficial write API.

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

Scoring still awards location points. There is now also a **hard pre-filter** on `profile.location_mode`:

- `us-or-remote` (default) — keep US on-site and anything remote; drop London/Stuttgart/etc. on-site
- `targets-or-remote` — remote, or a city listed in `target_locations`
- `any` — old behavior: score only, no drop

Change it on the settings page or by editing the stored profile. Target cities default to Remote (US), Chicago, NYC, SF, Palo Alto, Seattle, DC, Austin, Boston, Denver.

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
- `tests/test_filter.py` — Data Scientist and Office Assistant never reach the scorer as targets
- `tests/test_location.py` — London on-site is dropped under `us-or-remote`
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
app/geo.py            location allow / deny
app/scoring/score.py  heuristic scorer
app/tailor.py         resume / cover letter
app/apply.py          email vs ATS pack
app/digest.py         daily markdown
app/linkedin.py       copy-paste pack
app/db.py             SQLite
app/main.py           optional FastAPI viewer
tests/
```
