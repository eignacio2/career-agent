from urllib.parse import quote

from app.models import SourceJob
from app.sources.types import fetch_json, find_apply_email, strip_html


class RemotiveSource:
    id = "remotive"
    label = "Remotive"
    requires_network = True

    def fetch(self, queries: list[str], limit: int) -> list[SourceJob]:
        per_query = max(4, -(-limit // max(len(queries), 1)))
        collected: dict[str, SourceJob] = {}

        for query in queries:
            url = f"https://remotive.com/api/remote-jobs?search={quote(query)}&limit={per_query}"
            payload = fetch_json(url)
            if not payload or not isinstance(payload.get("jobs"), list):
                continue
            for job in payload["jobs"]:
                description = strip_html(job.get("description") or "")
                job_id = str(job.get("id"))
                collected[job_id] = SourceJob(
                    source=self.id,
                    source_id=job_id,
                    title=job.get("title") or "",
                    company=job.get("company_name") or "Unknown company",
                    location=job.get("candidate_required_location") or "Remote",
                    remote=True,
                    url=job.get("url") or "",
                    apply_email=find_apply_email(description),
                    description=description,
                    salary_text=(job.get("salary") or "").strip() or None,
                    tags=(job.get("tags") or [])[:12],
                    posted_at=job.get("publication_date"),
                )
        return list(collected.values())[:limit]
