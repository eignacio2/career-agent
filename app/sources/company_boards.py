"""Direct company career boards that post FDE / AI Engineer roles.

Public JSON only: Lever, Greenhouse, Ashby. Title matching is intentionally
wide here; the pipeline title filter is the real allowlist.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.models import SourceJob
from app.sources.types import fetch_json, find_apply_email, matches_query, strip_html

FDE_HINTS = (
    "forward deployed",
    "fde",
    "deployment engineer",
    "field engineer",
    "implementation engineer",
    "customer engineer",
    "solutions engineer",
    "ai engineer",
    "machine learning engineer",
    "ml engineer",
    "applied ai",
    "applied scientist",
    "llm",
)


def _looks_relevant(title: str, queries: list[str]) -> bool:
    if matches_query(title, queries):
        return True
    lowered = title.lower()
    return any(hint in lowered for hint in FDE_HINTS)


def _posted_at(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value
    if isinstance(value, (int, float)) and value > 0:
        stamp = float(value)
        if stamp > 1e12:
            stamp /= 1000
        return datetime.fromtimestamp(stamp, tz=timezone.utc).isoformat()
    return None


class LeverSource:
    requires_network = True

    def __init__(self, slug: str, company: str) -> None:
        self.slug = slug
        self.company = company
        self.id = f"lever:{slug}"
        self.label = f"{company} (Lever)"

    def fetch(self, queries: list[str], limit: int) -> list[SourceJob]:
        payload = fetch_json(f"https://api.lever.co/v0/postings/{self.slug}?mode=json")
        if not isinstance(payload, list):
            return []
        jobs: list[SourceJob] = []
        for row in payload:
            if not isinstance(row, dict):
                continue
            title = str(row.get("text") or "").strip()
            if not title or not _looks_relevant(title, queries):
                continue
            url = str(row.get("hostedUrl") or row.get("applyUrl") or "").strip()
            if not url:
                continue
            cats = row.get("categories") if isinstance(row.get("categories"), dict) else {}
            loc = str(cats.get("location") or "Unknown")
            description = strip_html(str(row.get("descriptionPlain") or row.get("description") or ""))
            jobs.append(
                SourceJob(
                    source=self.id,
                    source_id=str(row.get("id") or url),
                    title=title,
                    company=self.company,
                    location=loc,
                    remote="remote" in loc.lower(),
                    url=url,
                    apply_email=find_apply_email(description),
                    description=description,
                    salary_text=None,
                    tags=[str(cats.get("team") or ""), str(cats.get("commitment") or "")][:12],
                    posted_at=_posted_at(row.get("createdAt")),
                )
            )
            if len(jobs) >= limit:
                break
        return jobs


class GreenhouseSource:
    requires_network = True

    def __init__(self, slug: str, company: str) -> None:
        self.slug = slug
        self.company = company
        self.id = f"greenhouse:{slug}"
        self.label = f"{company} (Greenhouse)"

    def fetch(self, queries: list[str], limit: int) -> list[SourceJob]:
        payload = fetch_json(f"https://boards-api.greenhouse.io/v1/boards/{self.slug}/jobs")
        rows = payload.get("jobs") if isinstance(payload, dict) else None
        if not isinstance(rows, list):
            return []
        jobs: list[SourceJob] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            title = str(row.get("title") or "").strip()
            if not title or not _looks_relevant(title, queries):
                continue
            url = str(row.get("absolute_url") or "").strip()
            if not url:
                continue
            loc_obj = row.get("location")
            loc = loc_obj.get("name") if isinstance(loc_obj, dict) else str(loc_obj or "")
            loc = loc or "Unknown"
            jobs.append(
                SourceJob(
                    source=self.id,
                    source_id=str(row.get("id") or url),
                    title=title,
                    company=self.company,
                    location=loc,
                    remote="remote" in loc.lower(),
                    url=url,
                    apply_email=None,
                    description="",
                    salary_text=None,
                    tags=[],
                    posted_at=_posted_at(row.get("updated_at") or row.get("first_published")),
                )
            )
            if len(jobs) >= limit:
                break
        return jobs


class AshbySource:
    requires_network = True

    def __init__(self, slug: str, company: str) -> None:
        self.slug = slug
        self.company = company
        self.id = f"ashby:{slug}"
        self.label = f"{company} (Ashby)"

    def fetch(self, queries: list[str], limit: int) -> list[SourceJob]:
        payload = fetch_json(
            f"https://api.ashbyhq.com/posting-api/job-board/{self.slug}",
            params={"includeCompensation": "true"},
        )
        rows = payload.get("jobs") if isinstance(payload, dict) else None
        if not isinstance(rows, list):
            return []
        jobs: list[SourceJob] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            title = str(row.get("title") or "").strip()
            if not title or not _looks_relevant(title, queries):
                continue
            url = str(row.get("jobUrl") or "").strip()
            if not url:
                continue
            loc = str(row.get("location") or "")
            remote = bool(row.get("isRemote")) or "remote" in loc.lower()
            description = strip_html(str(row.get("descriptionPlain") or row.get("descriptionHtml") or ""))
            jobs.append(
                SourceJob(
                    source=self.id,
                    source_id=str(row.get("id") or url),
                    title=title,
                    company=self.company,
                    location=loc or ("Remote" if remote else "Unknown"),
                    remote=remote,
                    url=url,
                    apply_email=find_apply_email(description),
                    description=description,
                    salary_text=None,
                    tags=[str(row.get("departmentName") or "")][:12],
                    posted_at=_posted_at(row.get("publishedAt") or row.get("updatedAt")),
                )
            )
            if len(jobs) >= limit:
                break
        return jobs


def company_board_sources() -> list[LeverSource | GreenhouseSource | AshbySource]:
    return [
        LeverSource("palantir", "Palantir"),
        GreenhouseSource("andurilindustries", "Anduril"),
        GreenhouseSource("anthropic", "Anthropic"),
        GreenhouseSource("scaleai", "Scale AI"),
        AshbySource("openai", "OpenAI"),
        AshbySource("harvey", "Harvey"),
    ]
