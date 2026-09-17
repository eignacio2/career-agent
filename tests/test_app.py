from fastapi.testclient import TestClient

from app.main import app


def test_html_pages_render(tmp_db):
    client = TestClient(app)
    assert client.get("/").status_code == 200
    assert client.get("/jobs").status_code == 200
    assert client.get("/settings").status_code == 200
    assert client.get("/concepts").status_code == 200
    assert b"Career Agent" in client.get("/").content


def test_settings_resume_paste_replaces_stored_resume(tmp_db_ready):
    client = TestClient(app)
    page = client.get("/settings")
    assert page.status_code == 200
    assert b"Resume (paste" in page.content
    assert b"LinkedIn snapshot" in page.content
    response = client.post(
        "/settings",
        data={
            "full_name": "Alex Example",
            "email": "alex@example.com",
            "target_titles": "Data Scientist",
            "skills": "python",
            "experience_level": "new-grad",
            "location_mode": "remote-hybrid-onsite",
            "remote_preference": "any",
            "auto_apply_threshold": "72",
            "resume_paste": (
                "Alex Example\nalex@example.com\n\nExperience\n"
                "Data Analyst — Harbor Analytics\n- Wrote SQL for weekly reports.\n"
            ),
            "li_headline": "Data Analyst | Open to work",
            "li_about": "I write SQL.",
            "li_skills": "SQL, Excel",
        },
        follow_redirects=False,
    )
    assert response.status_code == 303
    resume = tmp_db_ready.get_resume()
    assert resume.experience
    assert resume.experience[0].company == "Harbor Analytics"
    assert "Wayfair" not in {role.company for role in resume.experience}
    snap = tmp_db_ready.get_snapshot()
    assert snap.headline.startswith("Data Analyst")
    profile = tmp_db_ready.get_profile()
    assert profile.full_name == "Alex Example"


def test_offline_run_via_http(tmp_db_ready):
    client = TestClient(app)
    response = client.post("/runs", data={"offline": "on"}, follow_redirects=False)
    assert response.status_code == 303
    home = client.get("/")
    assert home.status_code == 200
    assert b"Queued" in home.content
    jobs = client.get("/jobs?status=queued")
    assert jobs.status_code == 200
    assert b"Associate AI Engineer" in jobs.content or b"Forward Deployed" in jobs.content
