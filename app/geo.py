"""Location pre-filter and work-arrangement helpers.

Default mode keeps remote, hybrid, and on-site roles in any city (plus
postings that do not state an arrangement). Chicago-office is an opt-in
hard filter. Work-authorization caps still live here for the scorer
(`foreign_onsite_label`). That is a different question and a different function.
"""

from __future__ import annotations

import re
from typing import Literal

from app.models import Job, Profile, SourceJob

WorkArrangement = Literal["remote", "hybrid", "onsite", "unknown"]

CHICAGO = re.compile(r"\bchicago\b|\bchicagoland\b", re.I)
HYBRID = re.compile(r"\bhybrid\b", re.I)
# City office, not "Remote (Chicago)" as a timezone.
CHICAGO_OFFICE = re.compile(
    r"^\s*chicago\b"
    r"|\bchicago\b.{0,48}\b(il|illinois|hybrid|on[\s-]?site|in[\s-]?office|loop)\b"
    r"|\b(il|illinois|hybrid|on[\s-]?site|in[\s-]?office)\b.{0,48}\bchicago\b",
    re.I | re.S,
)
REMOTE_LEAD = re.compile(r"^\s*remote\b", re.I)
ONSITE = re.compile(r"\b(on[\s-]?site|in[\s-]?office|in[\s-]?person)\b", re.I)

NON_US_MARKERS = re.compile(
    r"\b(united kingdom|u\.k\.|uk|england|scotland|london|manchester|edinburgh|germany|berlin|"
    r"munich|stuttgart|hamburg|france|paris|spain|madrid|barcelona|netherlands|"
    r"amsterdam|ireland|dublin|poland|warsaw|krakow|india|bangalore|bengaluru|"
    r"hyderabad|mumbai|pune|singapore|australia|sydney|melbourne|canada|toronto|"
    r"vancouver|montreal|japan|tokyo|brazil|s[aã]o paulo|mexico city|israel|"
    r"tel aviv|switzerland|zurich|geneva|sweden|stockholm|denmark|copenhagen|"
    r"italy|milan|rome|portugal|lisbon|porto|romania|bucharest|czech|prague|"
    r"austria|vienna|belgium|brussels|norway|oslo|finland|helsinki|china|beijing|"
    r"shanghai|shenzhen|korea|seoul|hong kong|taiwan|taipei|dubai|abu dhabi|"
    r"u\.?a\.?e\.?|south africa|new zealand|auckland|argentina|chile|colombia|"
    r"bogot[aá]|philippines|manila|vietnam|hanoi|thailand|bangkok|indonesia|"
    r"jakarta|malaysia|kuala lumpur|turkey|istanbul|egypt|cairo|nigeria|lagos|"
    r"kenya|nairobi)\b",
    re.I,
)

DEFAULT_LOCATION_MODE = "remote-hybrid-onsite"


def _normalize(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9+#. ]", " ", value.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def is_remote(job: Job | SourceJob) -> bool:
    location = (job.location or "").lower()
    return bool(job.remote or "remote" in location or "anywhere" in location)


def mentions_chicago(job: Job | SourceJob) -> bool:
    return bool(CHICAGO.search(f"{job.title or ''} {job.location or ''}"))


def is_chicago_office(job: Job | SourceJob) -> bool:
    """True when the posting has a Chicago office someone can attend (on-site or hybrid)."""
    location = (job.location or "").strip()
    if not mentions_chicago(job):
        return False
    if HYBRID.search(location) and CHICAGO.search(location):
        return True
    if REMOTE_LEAD.search(location) and not HYBRID.search(location):
        return False
    return bool(CHICAGO_OFFICE.search(location)) or (
        bool(CHICAGO.search(location)) and not job.remote and "remote" not in location.lower()
    )


def work_arrangement(job: Job | SourceJob) -> WorkArrangement:
    """Best-effort remote | hybrid | onsite | unknown from the posting text."""
    location = job.location or ""
    if HYBRID.search(location):
        return "hybrid"
    if is_remote(job):
        return "remote"
    if ONSITE.search(location) or (location.strip() and not is_remote(job)):
        return "onsite"
    return "unknown"


def foreign_onsite_label(job: Job | SourceJob, profile: Profile) -> str | None:
    if is_remote(job):
        return None
    if any(NON_US_MARKERS.search(location) for location in profile.target_locations):
        return None
    match = NON_US_MARKERS.search(job.location or "")
    return match.group(0) if match else None


def matches_target_city(job: Job | SourceJob, profile: Profile) -> bool:
    location = (job.location or "").lower()
    for target in profile.target_locations:
        city = re.sub(r"\(.*\)", "", _normalize(target).split(",")[0]).strip()
        if len(city) > 2 and city != "remote" and city in location:
            return True
    return False


def location_allowed(job: Job | SourceJob, profile: Profile) -> tuple[bool, str]:
    """Hard pre-filter. Returns (ok, reason)."""
    mode = getattr(profile, "location_mode", None) or DEFAULT_LOCATION_MODE
    location = (job.location or "").strip() or "not stated"

    if mode == "any":
        return True, "Location filter off."

    if mode == "chicago-office":
        if is_chicago_office(job):
            if HYBRID.search(job.location or ""):
                return True, f"Chicago hybrid ({location})."
            return True, f"Chicago office ({location})."
        if mentions_chicago(job):
            return False, f"Names Chicago, but reads as remote-only ({location})."
        return False, f"Not a Chicago office or hybrid role ({location})."

    arrangement = work_arrangement(job)
    if arrangement == "remote":
        return True, f"Remote ({location})."
    if arrangement == "hybrid":
        return True, f"Hybrid ({location})."
    if arrangement == "onsite":
        return True, f"On-site ({location})."
    return True, f"Location not stated clearly ({location}); keeping it."
