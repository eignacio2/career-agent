"""Fan-out across job boards.

`all()` would abort the whole discovery if Arbeitnow timed out. `allSettled`
(here: try/except per source) lets Remotive and the new-grad board still
contribute. Empty live results fall back to the bundled sample board so the
pipeline is always exercisable.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.config import OFFLINE
from app.models import SourceJob
from app.sources.arbeitnow import ArbeitnowSource
from app.sources.newgrad import NewGradSource
from app.sources.remotive import RemotiveSource
from app.sources.sample import SampleSource
from app.sources.types import JobSource

LIVE_SOURCES: list[JobSource] = [NewGradSource(), RemotiveSource(), ArbeitnowSource()]
FALLBACK_SOURCE: JobSource = SampleSource()


@dataclass
class DiscoveryResult:
    jobs: list[SourceJob]
    sources_used: list[str] = field(default_factory=list)
    sources_failed: list[str] = field(default_factory=list)
    used_fallback: bool = False


def _dedupe(jobs: list[SourceJob]) -> list[SourceJob]:
    seen: set[str] = set()
    unique: list[SourceJob] = []
    for job in jobs:
        key = f"{job.company.lower().strip()}::{job.title.lower().strip()}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(job)
    return unique


def discover(queries: list[str], limit_per_source: int = 25, offline: bool | None = None) -> DiscoveryResult:
    use_offline = OFFLINE if offline is None else offline
    if use_offline:
        return DiscoveryResult(
            jobs=_dedupe(FALLBACK_SOURCE.fetch(queries, 25)),
            sources_used=[FALLBACK_SOURCE.label],
            used_fallback=True,
        )

    jobs: list[SourceJob] = []
    used: list[str] = []
    failed: list[str] = []

    for source in LIVE_SOURCES:
        try:
            results = source.fetch(queries, limit_per_source)
        except Exception:
            failed.append(source.label)
            continue
        if results:
            jobs.extend(results)
            used.append(source.label)
        else:
            failed.append(source.label)

    if not jobs:
        fallback = FALLBACK_SOURCE.fetch(queries, 25)
        return DiscoveryResult(
            jobs=_dedupe(fallback),
            sources_used=[FALLBACK_SOURCE.label],
            sources_failed=failed,
            used_fallback=True,
        )

    return DiscoveryResult(jobs=_dedupe(jobs), sources_used=used, sources_failed=failed)
