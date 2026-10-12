"""Tool bridge for the CLIs: MCP protocol, read vs write tools, Apply, analysis parsing."""
import io
import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import mcp_server  # noqa: E402


def run_mcp(lines, monkeypatch, post):
    monkeypatch.setattr(mcp_server, "_post", post)
    out = io.StringIO()
    monkeypatch.setattr(sys, "stdout", out)
    monkeypatch.setattr(sys, "stdin", io.StringIO("\n".join(json.dumps(x) for x in lines) + "\n"))
    mcp_server.main()
    return [json.loads(x) for x in out.getvalue().splitlines()]


def test_mcp_handshake_list_and_call(monkeypatch):
    def post(path, body):
        if path == "/mcp/tools":
            return {"tools": [{"name": "plan_goal", "description": "d", "inputSchema": {"type": "object"}}]}
        return {"result": {"echo": body["name"], "args": body["arguments"]}}
    r = run_mcp([{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}},
                 {"jsonrpc": "2.0", "method": "notifications/initialized"},
                 {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
                 {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "plan_goal", "arguments": {"x": 1}}},
                 {"jsonrpc": "2.0", "id": 4, "method": "nope"}], monkeypatch, post)
    assert [m["id"] for m in r] == [1, 2, 3, 4]  # notification got no reply
    assert r[0]["result"]["protocolVersion"] == "2025-06-18"
    assert r[1]["result"]["tools"][0]["name"] == "plan_goal"
    assert json.loads(r[2]["result"]["content"][0]["text"])["result"]["args"] == {"x": 1}
    assert r[3]["error"]["code"] == -32601


@pytest.fixture
def client(tmp_path, monkeypatch):
    from fincore.db import DB
    DB(tmp_path / "finance.db")
    monkeypatch.setenv("FINANCE_DB", str(tmp_path / "finance.db"))
    monkeypatch.setenv("PLANNER_ROOT", str(tmp_path))
    sys.modules.pop("server", None)
    import server
    from fastapi.testclient import TestClient
    return server, TestClient(server.app)


def test_write_tools_become_suggestions_and_apply_once(client):
    server, c = client
    pid = server.PROFILES.active()["id"]
    tok = server._new_session(pid, None, write=True)
    names = [t["name"] for t in c.post("/mcp/tools", json={"token": tok}).json()["tools"]]
    assert "save_goal" in names and "german_income_tax" in names
    tax = c.post("/mcp/call", json={"token": tok, "name": "german_income_tax", "arguments": {"zve": 60000}}).json()
    assert tax["result"]["total"] > 0
    before = len(c.get("/api/goals").json())
    r = c.post("/mcp/call", json={"token": tok, "name": "save_goal",
                                  "arguments": {"name": "Car", "target_today": 20000, "target_date": "2028-06-30"}}).json()
    assert r["status"] == "suggested" and len(c.get("/api/goals").json()) == before  # nothing changed yet
    prop = server._drain(tok)[-1][1]
    assert c.post("/chat/apply", json={"id": prop["id"]}).status_code == 200
    assert len(c.get("/api/goals").json()) == before + 1
    assert c.post("/chat/apply", json={"id": prop["id"]}).status_code == 400


def test_read_only_session_and_bad_token(client):
    server, c = client
    tok = server._new_session(server.PROFILES.active()["id"], None, write=False)
    names = [t["name"] for t in c.post("/mcp/tools", json={"token": tok}).json()["tools"]]
    assert not {"save_goal", "add_account", "update_deadline"} & set(names)
    assert c.post("/mcp/call", json={"token": tok, "name": "save_goal", "arguments": {}}).status_code == 403
    assert c.post("/mcp/tools", json={"token": "made-up"}).status_code == 403


def test_report_parsing(client):
    server, _ = client
    assert server._parse_report('Sure!\n{"headline": "Build cash", "actions": []}\nDone')["headline"] == "Build cash"
    assert server._parse_report("no json here") is None
