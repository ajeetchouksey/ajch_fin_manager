"""MCP bridge: lets Claude Code / Gemini CLI use the Finance Manager's own tools — and nothing else.

The app starts the CLI for one chat message or one analysis run and points it at this script
(stdio MCP server). Every tool call is forwarded to the running app over http://127.0.0.1 with a
one-time session token, so the app decides what the call may do:
- read tools and calculators run immediately;
- tools that would change your data are NOT executed — they come back to the chat as
  suggestions with an Apply button.

Env: FM_URL (e.g. http://127.0.0.1:8770), FM_TOKEN (session token). No third-party packages.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

URL = os.environ.get("FM_URL", "http://127.0.0.1:8770").rstrip("/")
TOKEN = os.environ.get("FM_TOKEN", "")


def _post(path: str, body: dict) -> dict:
    req = urllib.request.Request(URL + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return {"error": json.loads(e.read().decode("utf-8")).get("detail", str(e))}
        except ValueError:
            return {"error": str(e)}
    except OSError as e:
        return {"error": f"Finance Manager isn't reachable: {e}"}


def _reply(msg_id, result=None, error=None):
    out = {"jsonrpc": "2.0", "id": msg_id}
    if error:
        out["error"] = error
    else:
        out["result"] = result
    sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def handle(msg: dict):
    method, mid, params = msg.get("method"), msg.get("id"), msg.get("params") or {}
    if mid is None:  # notification (e.g. notifications/initialized): no reply
        return
    if method == "initialize":
        _reply(mid, {"protocolVersion": params.get("protocolVersion", "2024-11-05"),
                     "capabilities": {"tools": {"listChanged": False}},
                     "serverInfo": {"name": "finance-manager", "version": "1.0"}})
    elif method == "ping":
        _reply(mid, {})
    elif method == "tools/list":
        r = _post("/mcp/tools", {"token": TOKEN})
        _reply(mid, {"tools": r.get("tools", [])})
    elif method == "tools/call":
        r = _post("/mcp/call", {"token": TOKEN, "name": params.get("name"), "arguments": params.get("arguments") or {}})
        is_err = isinstance(r, dict) and "error" in r and len(r) == 1
        _reply(mid, {"content": [{"type": "text", "text": json.dumps(r, ensure_ascii=False, default=str)[:60000]}],
                     "isError": is_err})
    else:
        _reply(mid, error={"code": -32601, "message": f"Method not found: {method}"})


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        try:
            handle(msg)
        except Exception as e:  # noqa: BLE001 — never crash the CLI's tool connection
            if msg.get("id") is not None:
                _reply(msg["id"], error={"code": -32603, "message": str(e)})


if __name__ == "__main__":
    main()
