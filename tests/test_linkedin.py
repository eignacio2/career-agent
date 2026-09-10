from app.linkedin import CURRENT_SNAPSHOT, generate_linkedin_pack
from app.profile import DEFAULT_PROFILE, DEFAULT_RESUME
from tests.helpers import make_job


def test_linkedin_pack_kills_weak_headline():
    job = make_job(title="AI Engineer", tags=["python", "sql"], role_family="ai-engineering")
    pack = generate_linkedin_pack(DEFAULT_PROFILE, DEFAULT_RESUME, [job], CURRENT_SNAPSHOT)
    fields = {change.field for change in pack.changes}
    assert "Headline" in fields
    assert "Experience section" in fields
    assert "seeking" not in pack.headline.lower()
    assert "internship" not in pack.headline.lower()
    assert "microsoft office" not in pack.headline.lower()
    assert "Wayfair" in pack.about or any("Wayfair" in str(role) for role in pack.experience_rewrites)
