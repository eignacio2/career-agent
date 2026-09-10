from __future__ import annotations

from datetime import datetime, timezone

from app.models import SourceJob
from app.sources.types import fetch_json, find_apply_email, partial_match, strip_html


class ArbeitnowSource:
    id = "arbeitnow"
    label = "Arbeitnow"
    requires_network = True

    def fetch(self, queries: list[str], limit: int) -> list[SourceJob]:
        payload = fetch_json("https://www.arbeitnow.com/api/job-board-api")
        if not payload or not isinstance(payload.get("data"), list):
            return []

        needles = [query.lower() for query in queries]
        matches: list[SourceJob] = []
        for job in payload["data"]:
            haystack = f"{job.get('title') or ''} {' '.join(job.get('tags') or [])}".lower()
            if not any(needle in haystack or partial_match(haystack, needle) for needle in needles):
                continue
            description = strip_html(job.get("description") or "")
            created = job.get("created_at")
            posted_at = (
                datetime.fromtimestamp(created, tz=timezone.utc).isoformat() if created else None
            )
            matches.append(
                SourceJob(
                    source=self.id,
                    source_id=str(job.get("slug") or job.get("url") or job.get("title")),
                    title=job.get("title") or "",
                    company=job.get("company_name") or "Unknown company",
                    location=job.get("location") or ("Remote" if job.get("remote") else ""),
                    remote=bool(job.get("remote")),
                    url=job.get("url") or "",
                    apply_email=find_apply_email(description),
                    description=description,
                    salary_text=None,
                    tags=(job.get("tags") or [])[:12],
                    posted_at=posted_at,
                )
            )
            if len(matches) >= limit:
                break
        return matches
