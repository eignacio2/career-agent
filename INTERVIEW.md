# 15-minute interview walkthrough

Do not open `app/main.py` or the HTML templates unless they ask about the viewer.

## 1. Run it (2 min)

```bash
python3 -m app run --offline
python3 -m app queued
```

Say: sample board is mixed on purpose. New-grad DS I queues. Senior 5+ years does not. Office assistant never appears because the title filter dropped it before scoring.

## 2. Pipeline (3 min) — `app/pipeline.py`

Discover every board independently (one timeout does not abort the others). Fallback to sample board. Title filter. Insert if new (`UNIQUE source, source_id`). Score. Tailor only the queued ones. Email only when the posting lists an address **and** autopilot is on. Digest is markdown; SMTP is optional.

## 3. Why the filter is title-only (2 min) — `app/sources/filter.py`

Body text said “agent” on an office assistant posting. Title allowlist is cheaper and stricter. Internships are off by default.

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
- **Work authorization?** On-site London/Stuttgart is capped at 50 for a US-targeted profile. Remote is not.
