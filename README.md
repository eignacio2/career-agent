# Career Agent

An agent that runs your data science and AI engineering job search once a day: it pulls fresh
postings, scores each one against your actual background, tailors a resume and cover letter for the
strong matches, sends the applications it legitimately can, keeps your LinkedIn copy current, and
emails you a digest of everything it did.

It runs entirely on your machine against a local SQLite file. Nothing leaves your computer except
the job board queries, the model calls you configure, and the mail you tell it to send.

## What it actually does

Each run is a single pipeline:

0. **Import your history, once** — upload your resume as PDF, Word, Markdown, or plain text and it
   is parsed into a structured resume you can edit. Upload your LinkedIn profile the same way
   (More → Save to PDF) and the agent records what your profile says today.
1. **Discover** — queries the [New Grad Positions board](https://github.com/SimplifyJobs/New-Grad-Positions),
   [Remotive](https://remotive.com/api-documentation), and [Arbeitnow](https://www.arbeitnow.com/api)
   for each of your target titles. All three are free and need no key. If none respond, it falls back
   to a bundled sample board so the pipeline still works offline.
2. **Filter** — drops anything whose title is not recognizably data science or AI engineering work.
   Job boards return loose keyword matches, so this step is deliberately strict.
3. **Score** — rates each posting 0–100 on title alignment, technology overlap, level fit, location,
   and your compensation floor. Every score comes with the reasons behind it and the gaps you would
   be asked about. Level fit does the heavy lifting: the scorer reads the years of experience each
   posting demands and refuses to recommend anything above your ceiling.
4. **Tailor** — for anything above your threshold, reorders and trims your resume bullets for that
   posting and writes a cover letter grounded only in your real history.
5. **Apply** — emails the application when the posting publishes an address. When it goes through a
   company's own form, the pack is prepared and handed to you.
6. **Refresh your profile** — regenerates your LinkedIn copy, ranked against the requirements that
   actually appear in the postings it is finding. When you have uploaded your current profile it
   produces a field-by-field list of changes: what your headline says now, what to change it to, and
   why that specific wording is costing you.
7. **Digest** — emails you what was sent, what is waiting on you, and what was screened out and why.

## What it will not do, and why

Being direct about the limits, because the gap between "an agent applies for me" and what is
actually possible matters:

- **It does not fill in third-party application forms.** Greenhouse, Lever, Workday, and LinkedIn
  Easy Apply all prohibit scripted submission, and driving them with your credentials risks getting
  your accounts restricted. For those postings the agent prepares the complete application and you
  click submit. This is the majority of postings.
- **It does not edit your LinkedIn profile directly.** LinkedIn does not offer profile writes to
  third-party applications without partner API access, and it blocks automated reads of profile
  pages. So the agent writes the copy — headline, About, skills order, experience bullets — tells you
  exactly which fields to change, and you paste it in. About two minutes of work.
- **It does not invent experience.** Tailoring reorders, trims, and rephrases what you gave it, and
  preserves your numbers exactly. If you do not have the experience, it shows up as a gap in the
  score instead of a fabrication in your resume.
- **It does not mass-apply.** There is a hard daily cap and a match threshold, both yours to set.
  Volume without tailoring is how applications get ignored.

## Running it

```bash
npm install
npm run dev
```

Open http://127.0.0.1:43317. It works immediately with no configuration — matching and tailoring
fall back to built-in heuristics, and outbound mail is written to `.data/outbox` and rendered in the
dashboard instead of being sent.

Before you trust any output, replace the bundled example profile:

1. **Resume → Import my resume** — upload your actual resume. Review what was parsed, then save.
2. **LinkedIn → Upload my LinkedIn** — export your profile to PDF and upload it, so recommendations
   can name the specific fields to change.
3. **Settings → Career stage** — the highest-leverage setting in the app. It decides which postings
   are realistic applications and which are wasted ones.
4. **Settings → What to look for** — target titles, salary floor, and locations.

Then press **Run today's search** on the dashboard.

## If you are a new graduate

This matters more than any other setting, so it gets its own section.

General job boards skew heavily senior. Searching them as a new graduate returns postings that all
demand three to five years, and every one of those applications is discarded by a filter before a
human sees it. Two things in here exist specifically to prevent that:

- The **New Grad Positions board** is queried first, because that is where entry-level postings
  actually live. In testing, a new-graduate profile found zero worthwhile matches across the general
  boards and eight on this one in the same run.
- **Level over-reach caps the score** rather than merely reducing it. A posting demanding five years
  cannot reach your apply threshold no matter how well the technologies line up, because the
  technologies are not what will reject you. Set your ceiling under
  **Settings → Career stage → Most years a posting may demand**; 2 is a sensible default, since
  plenty of "2+ years" listings do hire graduates and almost no "5+ years" listing does.

Postings on another continent are capped too, since an on-site role abroad needs work authorization
that relocating within your own country does not.

## Configuration

Copy `.env.example` to `.env.local` and fill in what you want. Everything is optional.

| Variable | Effect when set |
| --- | --- |
| `OPENAI_API_KEY` | Replaces the keyword heuristics with real reasoning for scoring, resume tailoring, and cover letters. This is the single biggest quality upgrade. |
| `OPENAI_BASE_URL` | Point at any OpenAI-compatible endpoint: Groq, Together, OpenRouter, Ollama, vLLM. Defaults to OpenAI. |
| `OPENAI_MODEL` | Defaults to `gpt-4o-mini`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Actually delivers digests and email applications. Gmail needs an [App Password](https://support.google.com/accounts/answer/185833), not your account password. |
| `CRON_SECRET` | Requires a bearer token on `/api/cron/daily`. |
| `APP_BASE_URL` | Absolute URL used for links inside digest emails. |
| `CAREER_AGENT_DB` | SQLite path. Defaults to `.data/career-agent.db`. |
| `CAREER_AGENT_OFFLINE=1` | Skips the live boards and uses the bundled sample postings. Useful for development. |

Without a model key the agent still filters, scores, tailors, and reports — the scoring is
keyword-based rather than semantic, and cover letters are template-assembled from your real bullets
rather than written. Good enough to be useful, obviously worse than the model path.

## Scheduling the daily run

The app does not run its own scheduler, so nothing surprising happens while you are not looking.
Point any scheduler at the daily endpoint while the app is running:

```bash
# every day at 13:00 UTC
0 13 * * * /path/to/career-agent/scripts/run-daily.sh >> /tmp/career-agent.log 2>&1
```

Or call it directly:

```bash
curl -X POST http://127.0.0.1:43317/api/cron/daily \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Autopilot

Autopilot is off by default and worth leaving off until you have read a few tailored applications
end to end.

With it on, applications that clear your match threshold are emailed automatically — but only to
postings that publish an application address, and only up to your daily cap. Postings behind a
company's form always wait for you regardless of this setting.

## How scoring works

The heuristic scorer is transparent on purpose, so a bad score is debuggable rather than mysterious:

| Signal | Max | Notes |
| --- | --- | --- |
| Title alignment | 30 | Exact match with one of your target titles scores highest; loose word overlap scores little. |
| Skill coverage | 24 | Covering 60% of the technologies a posting names earns full marks, since no one matches a twenty-item list. Postings naming fewer than four technologies score neutrally rather than punishing you for their vagueness. |
| Level fit | 22 | Title seniority combined with the years of experience the description demands. |
| Location and remote fit | 16 | A posting with no stated location is scored neutrally, not assumed on-site. |
| Compensation | 6 | Only when a range is published. Hourly contract rates are not compared against an annual floor. |
| Role family | ±14 | Data science and AI engineering roles gain; adjacent roles lose. |

Two things override the arithmetic, because they describe obstacles that a strong score cannot
argue past:

- **Hard filters.** An excluded company or keyword drops a posting to zero, and a language model can
  never overrule that.
- **Score caps.** Demanding more years than your ceiling, requiring staff level or management, or
  sitting on-site in another country each cap the final score below the apply threshold. The posting
  stays visible and ranked so you can see what was found and why it was passed over.

## Project layout

```
src/app/                    Pages and API routes
src/app/api/agent/run       The pipeline entry point
src/app/api/cron/daily      Scheduler entry point
src/lib/agent/              Pipeline: score, tailor, apply, linkedin, digest
src/lib/sources/            Job board adapters and the offline fallback
src/lib/import/             Resume and LinkedIn parsing from PDF, DOCX, and text
src/lib/repo.ts             All database access
src/lib/db.ts               SQLite schema and migrations
scripts/run-daily.sh        Cron wrapper
```

## Your data

Your resume, LinkedIn snapshot, and application history live in `.data/`, which is gitignored and
never leaves the machine. Mail written without SMTP configured lands in `.data/outbox`. Nothing is
uploaded anywhere except the job board queries and, if you configure a key, the model calls needed to
score and tailor.

## Stack

Next.js 16, TypeScript, Tailwind CSS v4, shadcn/ui, SQLite via `better-sqlite3`, Nodemailer,
`unpdf` and `mammoth` for document parsing.
