# 15-minute interview walkthrough

Do not open `app/main.py` or the HTML templates unless they ask about the viewer.

**The night before (or that morning):** run live so SQLite already holds real postings. Do not depend on a network fetch during a 15-minute screen.

```bash
python3 -m app run
python3 -m app queued
```

You should see real companies (HPE, TikTok, Citadel, …), not Harborview / Rivermark. Those sample names only appear with `--offline`.

## 1. Show the output (2 min)

```bash
python3 -m app queued
python3 -m app digest
```

Say: these came from the New Grad Positions board, remote aggregators, and company career APIs (Palantir Lever, Anduril/Anthropic/Scale Greenhouse, OpenAI/Harvey Ashby). Title filter keeps AI Engineer and Forward Deployed Engineer; data-science titles are dropped. Location filter drops foreign on-site. Anything still queued cleared 72. ATS links are in the list; the agent does not submit the form.

`--offline` is the **test fixture**, not the demo. Use it only if they ask “how do you test without the network?” — then run `pytest` and, if you want, `python3 -m app run --offline` to show a Senior 5+ years role getting capped.

## 2. Pipeline (3 min) — `app/pipeline.py`

Discover every board independently (one timeout does not abort the others). Fallback to sample board. Title filter (AI Eng / FDE only). Location filter (`us-or-remote` by default). Insert if new (`UNIQUE source, source_id`). Score. Tailor only the queued ones. Email only when the posting lists an address **and** autopilot is on. Digest is markdown; SMTP is optional.

## 3. Why the filter is title-only (2 min) — `app/sources/filter.py`

Body text said “agent” on an office assistant posting. Title allowlist is cheaper and stricter. Data Scientist titles are classified but not queued — this search is AI Engineer and Forward Deployed Engineer. Internships are off by default.

## 4. Caps, not penalties (4 min) — `app/scoring/score.py` + `tests/test_score.py`

Weights: title 30, skills 24, level 22, location 16, salary 6, family ±14.

A −20 penalty on an 88 still clears threshold 72. A **cap of 45** cannot. Years over-reach, staff titles, and foreign on-site work use caps because they are screen-outs.

`extract_required_years`: `4+ years` without the word “experience” still counts. “Over the past 5 years” does not. Lowest figure is the gate.

## 5. Tailoring (2 min) — `app/tailor.py`

Reorders existing bullets by overlap with the posting. Hard rule: never invent employers, dates, or metrics. Show `tests/test_tailor.py`.

## 6. What you did not automate (1 min)

Greenhouse/Lever/Workday/Easy Apply are not filled in. LinkedIn is a copy-paste pack, not an unofficial write. That is a ToS and an honesty choice, not a missing feature.

## Likely follow-ups

- **Why SQLite?** One candidate, one machine, no ops. WAL + a transaction for score+status.
- **Why no LLM?** Every number in scoring is deterministic and tested. An LLM overlay that cannot override `Excluded` or raise a cap is a later addition, not the core.
- **Work authorization?** On-site London/Stuttgart is **dropped** under `location_mode=us-or-remote` (default). If you turn the filter to `any`, those roles are still capped at 50. Remote is kept.
