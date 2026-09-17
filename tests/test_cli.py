from app.cli import main


def test_cli_offline_run_and_queued(tmp_db_ready, capsys):
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


def test_cli_load_resume_and_linkedin(tmp_db, tmp_path, capsys):
    resume_path = tmp_path / "resume.txt"
    resume_path.write_text(
        "Alex Example\nalex@example.com\n\nExperience\n"
        "Data Analyst — Harbor Analytics\n- Wrote SQL for weekly reports.\n",
        encoding="utf-8",
    )
    assert main(["load-resume", str(resume_path)]) == 0
    out = capsys.readouterr().out
    assert "Harbor Analytics" in out
    assert tmp_db.get_resume().experience[0].company == "Harbor Analytics"

    li_path = tmp_path / "linkedin.txt"
    li_path.write_text("Headline: Analyst seeking internship\nAbout: Microsoft Office\nSkills: Excel\n", encoding="utf-8")
    assert main(["load-linkedin", str(li_path)]) == 0
    assert "seeking internship" in tmp_db.get_snapshot().headline.lower()
