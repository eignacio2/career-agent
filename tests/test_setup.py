from app.cli import main
from app.profile import DEFAULT_PROFILE


def test_cli_blocks_run_when_profile_is_blank(tmp_db, capsys):
    assert main(["run", "--offline"]) == 1
    err = capsys.readouterr().err
    assert "not ready" in err.lower() or "load-demo" in err


def test_cli_load_demo_then_status(tmp_db, capsys):
    assert main(["load-demo"]) == 0
    out = capsys.readouterr().out
    assert "Ethan Ignacio" in out
    assert tmp_db.get_profile().full_name == DEFAULT_PROFILE.full_name
    assert main(["status"]) == 0
    status = capsys.readouterr().out
    assert "Ethan Ignacio" in status
    assert "Setup incomplete" not in status
    assert "LLM overlay: off" in status
