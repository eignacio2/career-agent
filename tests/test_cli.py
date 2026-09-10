from app.cli import main


def test_cli_offline_run_and_queued(tmp_db, capsys):
    assert main(["run", "--offline"]) == 0
    out = capsys.readouterr().out
    assert "Run " in out
    assert "Associate AI Engineer" in out or "Forward Deployed" in out or "queued" in out.lower()

    assert main(["queued"]) == 0
    queued = capsys.readouterr().out
    assert "Associate AI Engineer" in queued or "Forward Deployed" in queued

    assert main(["status"]) == 0
    assert main(["digest"]) == 0
    digest = capsys.readouterr().out
    assert "Job search digest" in digest or "ready for your review" in digest.lower() or "Screened" in digest

    assert main(["linkedin"]) == 0
    linkedin = capsys.readouterr().out
    assert "Headline" in linkedin
    assert "linkedin-pack.md" in linkedin
