"""Himalayas public jobs JSON API (remote-first)."""

from __future__ import annotations

from app.models import SourceJob
from app.sources.types import fetch_json, find_apply_email, matches_query, strip_html

HIMALAYAS_API = "https://himalayas.app/jobs/api"


def _location(row: dict) -> str:
    restrictions = row.get("locationRestrictions")
    if isinstance(restrictions, list):
        return ", ".join(str(item) for item in restrictions if item) or "Remote"
    if isinstance(restrictions, str) and restrictions.strip():
        return restrictions.strip()
    return "Remote"


class HimalayasSource:
    id = "himalayas"
    label = "Himalayas"
    requires_network = True

    def fetch(self, queries: list[str], limit: int) -> list[SourceJob]:
        payload = fetch_json(HIMALAYAS_API, params={"limit": min(max(limit * 3, 20), 40)})
        rows = payload.get("jobs") if isinstance(payload, dict) else None
        if not isinstance(rows, list):
            return []

        jobs: list[SourceJob] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            title = str(row.get("title") or "").strip()
            if not title or not matches_query(title, queries):
                continue
            url = str(row.get("applicationLink") or row.get("guid") or "").strip()
            if not url:
                continue
            description = strip_html(str(row.get("description") or ""))
            loc = _location(row)
            jobs.append(
                SourceJob(
                    source=self.id,
                    source_id=str(row.get("guid") or url),
                    title=title,
                    company=str(row.get("companyName") or "Unknown company"),
                    location=loc,
                    remote=True,
                    url=url,
                    apply_email=find_apply_email(description),
                    description=description,
                    salary_text=None,
                    tags=[str(row.get("seniority") or ""), str(row.get("employmentType") or "")][:12],
                    posted_at=str(row.get("pubDate") or "") or None,
                )
            )
            if len(jobs) >= limit:
                break
        return jobs
