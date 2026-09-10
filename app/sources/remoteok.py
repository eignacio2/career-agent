"""RemoteOK public JSON API. Index 0 is a legal notice, not a job."""

from __future__ import annotations

from datetime import datetime, timezone

from app.models import SourceJob
from app.sources.types import fetch_json, find_apply_email, matches_query, strip_html

REMOTEOK_API = "https://remoteok.com/api"
REMOTEOK_UA = "Mozilla/5.0 (compatible; career-agent/2.0; student project)"


class RemoteOKSource:
    id = "remoteok"
    label = "RemoteOK"
    requires_network = True

    def fetch(self, queries: list[str], limit: int) -> list[SourceJob]:
        payload = fetch_json(REMOTEOK_API, extra_headers={"User-Agent": REMOTEOK_UA})
        if not isinstance(payload, list):
            return []

        jobs: list[SourceJob] = []
        for row in payload:
            if not isinstance(row, dict) or "legal" in row:
                continue
            title = str(row.get("position") or "").strip()
            if not title or not matches_query(title, queries):
                continue
            apply_url = str(row.get("apply_url") or row.get("url") or "").strip()
            if not apply_url:
                continue
            description = strip_html(str(row.get("description") or ""))
            loc = str(row.get("location") or "Remote").strip() or "Remote"
            tags = row.get("tags") if isinstance(row.get("tags"), list) else []
            salary_min = row.get("salary_min")
            salary_max = row.get("salary_max")
            salary_text = None
            if isinstance(salary_min, int) and isinstance(salary_max, int) and salary_max:
                salary_text = f"${salary_min:,} - ${salary_max:,}"
            posted_at = None
            epoch = row.get("epoch")
            if isinstance(epoch, (int, float)) and epoch > 0:
                posted_at = datetime.fromtimestamp(int(epoch), tz=timezone.utc).isoformat()
            jobs.append(
                SourceJob(
                    source=self.id,
                    source_id=str(row.get("id") or apply_url),
                    title=title,
                    company=str(row.get("company") or "Unknown company"),
                    location=loc,
                    remote=True,
                    url=apply_url,
                    apply_email=find_apply_email(description),
                    description=description,
                    salary_text=salary_text,
                    tags=[str(tag) for tag in tags[:12]],
                    posted_at=posted_at,
                )
            )
            if len(jobs) >= limit:
                break
        return jobs
