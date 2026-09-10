# Concept ledger

Living notes for the Python rewrite. The in-app page `/concepts` is the short version.

## Owned (from TypeScript v1, still true)

| Idea | Why it matters |
| --- | --- |
| `SourceJob → Job → scored Job` | A board has no id in *our* database. Inserting is the moment a posting becomes ours. Score fields hang on the job because there is one candidate. |
| Title pre-filter | Body matching pulled in “Office Assistant — AI Lab Admin”. Titles are the only reliable signal at this stage. |
| Fan-out with isolation | One timed-out board must not abort discovery. Empty live results → sample board. |
| Caps vs penalties | Penalties still clear a 72 threshold. Caps do not. Use caps for screen-outs (years, staff, foreign on-site). |
| Two-write gap | v1 updated application + job status separately. This slice writes score and status in one transaction. |

## This slice

| Idea | Where |
| --- | --- |
| Test pyramid | Years + caps are pure unit tests. One pipeline test uses a temp SQLite file. |
| Parse vs validate | `httpx` returns dicts. `SourceJob` / `Profile` are Pydantic models. Do not score a raw dict. |
| Unit of work | `db.record_score(...)` is the commit boundary. |

## Ahead (do not implement until the core is boring)

- Auth on HTML routes
- Cross-process run lock (today: threading lock + `runs.status = running`)
- Real migrations
- LLM overlay that **cannot** override `Excluded` or raise a capped score
- Digest email, tailoring, PDF import, LinkedIn packs
- Prompt injection: job descriptions are untrusted text
