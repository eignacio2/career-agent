from fastapi.testclient import TestClient

from app.main import app


def test_html_pages_render(tmp_db):
    client = TestClient(app)
    assert client.get("/").status_code == 200
    assert client.get("/jobs").status_code == 200
    assert client.get("/settings").status_code == 200
    assert client.get("/concepts").status_code == 200
    assert b"Career Agent" in client.get("/").content


def test_offline_run_via_http(tmp_db):
    client = TestClient(app)
    response = client.post("/runs", data={"offline": "on"}, follow_redirects=False)
    assert response.status_code == 303
    home = client.get("/")
    assert home.status_code == 200
    assert b"Queued" in home.content
    jobs = client.get("/jobs?status=queued")
    assert jobs.status_code == 200
    assert b"Associate AI Engineer" in jobs.content or b"Forward Deployed" in jobs.content
