"""Users/onboarding and the CLI assistant path (fake `claude` command; no network)."""
import os
import stat
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fincore import ai_cli, profiles  # noqa: E402
from fincore.db import DB  # noqa: E402


def test_existing_install_becomes_first_user_in_place(tmp_path):
    DB(tmp_path / "finance.db")
    reg = profiles.Profiles(tmp_path, tmp_path / "finance.db", tmp_path / "planner")
    p = reg.active()
    assert p["legacy"] and p["onboarded"] and p["db"] == str(tmp_path / "finance.db")
    assert p["docs_root"] == str(tmp_path / "planner")


def test_new_user_gets_own_folder_and_unique_id(tmp_path):
    reg = profiles.Profiles(tmp_path, tmp_path / "finance.db", tmp_path)
    a, b = reg.create("Priya Sharma"), reg.create("Priya Sharma")
    assert a["id"] == "priya-sharma" and b["id"] == "priya-sharma-2"
    assert Path(a["docs_root"]).is_dir() and not a["onboarded"]
    assert reg.active()["id"] == "priya-sharma-2"
    reg.activate("priya-sharma")
    assert reg.active()["id"] == "priya-sharma"
    with pytest.raises(ValueError):
        reg.create("  ")


def test_clean_inputs():
    assert profiles.clean_countries(["DE", "XX", "DE", "IN"]) == ["DE", "IN"]
    assert profiles.clean_currencies(["eur", "INR", "€", "usd"]) == ["EUR", "INR", "USD"]


@pytest.mark.skipif(os.name == "nt", reason="uses a POSIX shell script as the fake CLI")
def test_cli_stream_blocks_tools_and_runs_in_empty_folder(tmp_path, monkeypatch):
    fake = tmp_path / "claude"
    fake.write_text('#!/bin/sh\ninput=$(cat)\necho "args:$*"\necho "files:$(ls -A | wc -l)"\necho "q:$(echo "$input" | tail -1)"\n')
    fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("PATH", f"{tmp_path}{os.pathsep}{os.environ['PATH']}")
    prompt = ai_cli.build_prompt("SYS", {"net": 1}, [], [{"role": "user", "content": "hi"}], "Am I ok?")
    out = "".join(v for k, v in ai_cli.stream("claude_cli", prompt) if k == "text")
    assert "--disallowedTools" in out and "Bash" in out and "Read" in out
    assert "files:0" in out and "q:Am I ok?" in out


def test_missing_cli_is_a_clear_error(monkeypatch):
    monkeypatch.setattr(ai_cli.shutil, "which", lambda _: None)
    kind, msg = next(ai_cli.stream("gemini_cli", "x"))
    assert kind == "error" and "npm install -g @google/gemini-cli" in msg
