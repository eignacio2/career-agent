"""Shared fixtures. Tests should not touch the developer's .data/ database."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.profile import DEFAULT_PROFILE, DEFAULT_RESUME


@pytest.fixture
def profile():
    return DEFAULT_PROFILE.model_copy()


@pytest.fixture
def resume():
    return DEFAULT_RESUME.model_copy()


@pytest.fixture
def tmp_db(tmp_path: Path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("CAREER_AGENT_DB", str(db_path))
    monkeypatch.setenv("CAREER_AGENT_DATA", str(tmp_path))
    import app.config as config
    import app.db as db

    monkeypatch.setattr(config, "DB_PATH", db_path)
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    db.reset_connection()
    yield db
    db.reset_connection()


@pytest.fixture
def tmp_db_ready(tmp_db):
    """Same isolated DB, with the Ethan demo candidate saved so a run can start."""
    tmp_db.save_profile(DEFAULT_PROFILE)
    tmp_db.save_resume(DEFAULT_RESUME)
    return tmp_db
