# Concept ledger

Living notes for the Python rewrite. The in-app page `/concepts` is the short version.

## Owned (from TypeScript v1, still true)

| Idea | Why it matters |
| --- | --- |
| `SourceJob → Job → scored Job` | A board has no id in *our* database. Inserting is the moment a posting becomes ours. Score fields hang on the job because there is one candidate. |
| Title pre-filter | Body matching pulled in “Office Assistant — AI Lab Admin”. Titles are the only reliable signal. The allowlist is the candidate’s target titles; AI / FDE / DS families expand. |
| Resume paste | Structured resume comes from text you paste. Parser extracts; it does not invent employers. |
| LinkedIn snapshot | Pack diffs against pasted headline/About/skills. No URL fetch, no unofficial write. |
| Location pre-filter | Default keeps remote, hybrid, and on-site (any city). Scoring boosts target cities; foreign on-site is a cap, not a drop. |
| Fan-out with isolation | One timed-out board must not abort discovery. Empty live results → sample board. |
| Caps vs penalties | Penalties still clear a 72 threshold. Caps do not. Use caps for screen-outs (years, staff, foreign on-site). |
| Two-write gap | v1 updated application + job status separately. This slice writes score and status in one transaction. |

## This slice

| Idea | Where |
| --- | --- |
| CLI is the product | `python -m app run` — `app/cli.py` |
| Test pyramid | Years + caps are pure unit tests. CLI test hits SQLite with the sample board. |
| Parse vs validate | `httpx` returns dicts. `SourceJob` / `Profile` are Pydantic models. Do not score a raw dict. |
| Unit of work | `db.record_score` and `db.upsert_application` wrap status writes in one transaction. |
| Tailor ≠ invent | Heuristic reorder in `app/tailor.py`. Optional LLM rewrite in `app/llm.py`. Facts gate in `app/facts.py` discards invented employers, metrics, and skills. |
| Email vs ATS | Address → `send_mail`. Form URL → pack on disk. No Greenhouse bots. |
| Score stays heuristic | `score_job` does not call a model. Overlay cannot raise a cap. |

## Ahead (do not pretend these are done)

- Auth on HTML routes
- Cross-process run lock (today: threading lock + `runs.status = running`)
- Real migrations
- Optional LLM overlay that **cannot** override `Excluded` or raise a capped score
- Prompt injection: job descriptions are untrusted text (the facts gate is the current defense on the tailor path)

Digest and LinkedIn packs are heuristics + local files. Tailoring is heuristic reorder plus an optional model rewrite. SMTP is optional.
