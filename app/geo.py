"""Location matching shared by the pre-filter and the scorer.

Two different questions:
- Allowed? (hard filter — never score a Stuttgart on-site role for a US search)
- How well does it fit? (points inside the scorer)
"""

from __future__ import annotations

import re

from app.models import Job, Profile, SourceJob

NON_US_MARKERS = re.compile(
    r"\b(united kingdom|england|scotland|london|manchester|edinburgh|germany|berlin|"
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

US_HINTS = re.compile(
    r"\b(united states|u\.s\.a?\.?|usa|america|remote \(us\)|us remote|us-remote)\b",
    re.I,
)


def _normalize(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9+#. ]", " ", value.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def is_remote(job: Job | SourceJob) -> bool:
    location = (job.location or "").lower()
    return bool(job.remote or "remote" in location or "anywhere" in location)


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
    mode = getattr(profile, "location_mode", "us-or-remote") or "any"
    if mode == "any":
        return True, "Location filter off."

    if is_remote(job):
        return True, "Remote."

    location = (job.location or "").strip()
    if not location:
        if mode == "targets-or-remote":
            return False, "No location stated, and the search is restricted to target cities or remote."
        return True, "Location unstated."

    foreign = foreign_onsite_label(job, profile)
    if foreign:
        return False, f"On-site in {job.location} (needs work authorization you may not hold)."

    if mode == "us-or-remote":
        return True, "US on-site (or not flagged as foreign)."

    if matches_target_city(job, profile):
        return True, "Matches a target city."
    return False, f"On-site in {job.location}, outside your target cities."
