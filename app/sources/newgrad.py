"""Community-maintained new-graduate openings (SimplifyJobs feed).

General remote-job aggregators skew senior. This board is where entry-level
postings actually live; without it an early-career search finds almost nothing
worth applying to.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from app.models import SourceJob
from app.sources.types import fetch_json

FEED_URL = (
    "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/"
    "dev/.github/scripts/listings.json"
)
MAX_AGE_DAYS = 75
FETCH_TIMEOUT_S = 45.0


def _is_recent(listing: dict) -> bool:
    stamp = listing.get("date_updated") or listing.get("date_posted")
    if not stamp:
        return True
    age_days = (datetime.now(timezone.utc).timestamp() - stamp) / 86_400
    return age_days <= MAX_AGE_DAYS


def _matches_query(title: str, queries: list[str]) -> bool:
    lowered = title.lower()
    for query in queries:
        needle = query.lower().strip()
        if not needle:
            continue
        if needle in lowered:
            return True
        words = [word for word in needle.split() if len(word) > 3]
        if len(words) > 1 and all(word in lowered for word in words):
            return True
    return False


class NewGradSource:
    id = "newgrad-board"
    label = "New Grad Positions board"
    requires_network = True

    def fetch(self, queries: list[str], limit: int) -> list[SourceJob]:
        listings = fetch_json(FEED_URL, timeout_s=FETCH_TIMEOUT_S)
        if not isinstance(listings, list):
            return []

        results: list[SourceJob] = []
        for listing in listings:
            if listing.get("active") is False or listing.get("is_visible") is False:
                continue
            title = listing.get("title") or ""
            url = listing.get("url") or ""
            if not title or not url:
                continue
            if not _is_recent(listing):
                continue
            if not _matches_query(title, queries):
                continue

            locations = listing.get("locations") or []
            location_text = " · ".join(locations)
            remote = bool(re.search(r"remote|anywhere", location_text, re.I))
            company = listing.get("company_name") or "Unknown company"
            tags = []
            if listing.get("category"):
                tags.append(listing["category"])
            tags.extend(listing.get("degrees") or [])
            sponsorship = listing.get("sponsorship")
            if sponsorship and sponsorship != "Other":
                tags.append(sponsorship)

            posted_at = None
            if listing.get("date_posted"):
                posted_at = datetime.fromtimestamp(
                    listing["date_posted"], tz=timezone.utc
                ).isoformat()

            results.append(
                SourceJob(
                    source=self.id,
                    source_id=str(listing.get("id") or f"{company}-{title}"),
                    title=title,
                    company=company,
                    location=location_text or "Not stated",
                    remote=remote,
                    url=url,
                    apply_email=None,
                    description="",
                    salary_text=None,
                    tags=tags[:12],
                    posted_at=posted_at,
                    early_career=True,
                )
            )
            if len(results) >= limit:
                break
        return results

