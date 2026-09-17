"""Gate that decides whether a search is allowed to start.

The agent is one candidate per SQLite file. A new file used to be pre-filled
as Ethan Ignacio, so anyone who cloned the repo searched *his* titles. This
module is the check: name, email, and at least one target title must be set
before discover() runs.

Interview line: setup is a precondition, not a default person.
"""

from __future__ import annotations

from app.models import Profile

PLACEHOLDER_NAMES = {"", "your name", "candidate", "example"}


def missing_setup_fields(profile: Profile) -> list[str]:
    """Human-readable list of what is still blank. Empty list means ready."""
    missing: list[str] = []
    name = (profile.full_name or "").strip()
    if not name or name.lower() in PLACEHOLDER_NAMES:
        missing.append("full name")
    email = (profile.email or "").strip()
    if "@" not in email:
        missing.append("email")
    titles = [title.strip() for title in profile.target_titles if title.strip()]
    if not titles:
        missing.append("at least one target title")
    return missing


def profile_is_ready(profile: Profile) -> bool:
    return not missing_setup_fields(profile)


class SetupIncomplete(RuntimeError):
    """Raised when run_agent is called before the profile can represent a person."""

    def __init__(self, missing: list[str]) -> None:
        self.missing = missing
        fields = ", ".join(missing)
        super().__init__(
            "Profile is not ready to search. Set "
            f"{fields}. Use the Profile page, or `python -m app load-demo` "
            "to load the bundled Ethan Ignacio example."
        )
