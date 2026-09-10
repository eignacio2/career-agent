"""Jobicy public remote-jobs JSON API."""

from __future__ import annotations

from app.models import SourceJob
from app.sources.types import fetch_json, find_apply_email, matches_query, strip_html

JOBICY_API = "https://jobicy.com/api/v2/remote-jobs"


class JobicySource:
    id = "jobicy"
    label = "Jobicy"
    requires_network = True

    def fetch(self, queries: list[str], limit: int) -> list[SourceJob]:
        payload = fetch_json(JOBICY_API, params={"count": min(max(limit * 4, 20), 100)})
        rows = payload.get("jobs") if isinstance(payload, dict) else None
        if not isinstance(rows, list):
            return []

        jobs: list[SourceJob] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            title = str(row.get("jobTitle") or "").strip()
            if not title or not matches_query(title, queries):
                continue
            url = str(row.get("url") or "").strip()
            if not url:
                continue
            description = strip_html(str(row.get("jobDescription") or row.get("jobExcerpt") or ""))
            loc = str(row.get("jobGeo") or "Remote") or "Remote"
            jobs.append(
                SourceJob(
                    source=self.id,
                    source_id=str(row.get("id") or url),
                    title=title,
                    company=str(row.get("companyName") or "Unknown company"),
                    location=loc,
                    remote=True,
                    url=url,
                    apply_email=find_apply_email(description),
                    description=description,
                    salary_text=str(row.get("jobSalary") or "").strip() or None,
                    tags=[str(tag) for tag in (row.get("jobTags") or [])[:12]]
                    if isinstance(row.get("jobTags"), list)
                    else [],
                    posted_at=str(row.get("pubDate") or "") or None,
                )
            )
            if len(jobs) >= limit:
                break
        return jobs
