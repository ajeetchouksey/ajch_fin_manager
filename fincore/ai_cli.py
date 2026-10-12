"""Use an AI command-line tool you already have instead of an API key.

Providers
---------
- "claude_cli": Claude Code (`claude`), signed in with your Claude Pro/Max account.
- "gemini_cli": Google's Gemini CLI (`gemini`), signed in with your Google account.

How it works: the app builds one prompt — the assistant's instructions, a snapshot of your
numbers and deadlines, the conversation so far and your question — and pipes it to the CLI
in non-interactive mode. The CLI runs in an empty scratch folder with file, shell and edit
tools switched off, so it can only answer: it can't read your folders or change anything.
With `tools` (an MCP bridge to the running app, see mcp_server.py) the CLI can also call the
app's own calculators and read tools; anything that would change your data comes back as a
suggestion you apply in the chat. No other tools are available to it.

What leaves the laptop: the same as with the API option — the snapshot and your messages go
to Anthropic (Claude CLI) or Google (Gemini CLI).
"""
from __future__ import annotations

import json
import os
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Callable, Iterator

PROVIDERS = {
    "none": "No AI — the app works fully without it",
    "api": "Anthropic API key — full assistant with calculators (billed per use)",
    "claude_cli": "Claude Code CLI — uses your Claude Pro login, no API bill",
    "gemini_cli": "Gemini CLI — uses your Google login",
}
CLI = {"claude_cli": "claude", "gemini_cli": "gemini"}
INSTALL = {
    "claude_cli": "npm install -g @anthropic-ai/claude-code   then run  claude  once to sign in",
    "gemini_cli": "npm install -g @google/gemini-cli   then run  gemini  once to sign in with Google",
}
# Claude Code tools that could touch files, run commands or fetch pages — all blocked.
CLAUDE_BLOCKED = ["Bash", "Edit", "Write", "MultiEdit", "NotebookEdit", "Read", "Glob", "Grep", "LS",
                  "WebFetch", "Task", "TodoWrite"]
TIMEOUT = 240


def which(provider: str) -> str | None:
    exe = CLI.get(provider)
    return shutil.which(exe) if exe else None


def status() -> dict:
    out = {}
    for p in CLI:
        path = which(p)
        out[p] = {"installed": bool(path), "path": path or "", "install": INSTALL[p]}
    return out


def build_prompt(system: str, snapshot: dict, deadlines: list, history: list[dict], question: str,
                 tools: bool = False) -> str:
    convo = []
    for m in history[-12:]:  # keep the prompt small
        if isinstance(m.get("content"), str):
            who = "User" if m["role"] == "user" else "Assistant"
            convo.append(f"{who}: {m['content']}")
        elif m["role"] == "assistant":
            txt = "".join(b.get("text", "") for b in m["content"] if b.get("type") == "text")
            if txt:
                convo.append(f"Assistant: {txt}")
    return (
        f"{system}\n\n"
        + ("You have the Finance Manager's tools (server \"finance\"): use its calculators for any tax, savings-plan "
           "or backtest figure and its read tools for fresh data. Tools that change data (save_goal, add_account, "
           "add_transaction, add_expense, update_deadline) do not apply anything themselves: they create a suggestion "
           "the user confirms in the app — tell them to press Apply. Only suggest changes they asked for. "
           "Do not try to read files or run commands.\n\n"
           if tools else
           "You are running without the app's calculator tools. Answer only from the data below; "
           "if a figure isn't there, say what to add in the app instead of guessing. "
           "Do not try to read files or run commands.\n\n")
        + f"## The user's financial snapshot (JSON)\n{json.dumps(snapshot, ensure_ascii=False, default=str)[:30000]}\n\n"
        f"## Open deadlines (JSON)\n{json.dumps(deadlines, ensure_ascii=False, default=str)[:12000]}\n\n"
        + ("## Conversation so far\n" + "\n\n".join(convo) + "\n\n" if convo else "")
        + f"## Question\n{question}\n"
    )


MCP_NAME = "finance"
# Gemini CLI built-in tools that touch files, run commands or fetch pages.
GEMINI_EXCLUDED = ["run_shell_command", "write_file", "replace", "read_file", "read_many_files", "glob",
                   "search_file_content", "list_directory", "web_fetch", "save_memory"]


def command(provider: str, model: str | None = None, mcp_config: Path | None = None) -> list[str]:
    exe = which(provider)
    if not exe:
        raise FileNotFoundError(provider)
    ask = "Answer the request at the end of the input above."
    if provider == "claude_cli":
        cmd = [exe, "-p", ask, "--output-format", "text"]
        if mcp_config:
            # only the app's tools: ignore any MCP servers configured elsewhere, auto-approve ours
            cmd += ["--mcp-config", str(mcp_config), "--strict-mcp-config", "--allowedTools", f"mcp__{MCP_NAME}"]
        cmd += ["--disallowedTools", *CLAUDE_BLOCKED]
        if model:
            cmd += ["--model", model]
        return cmd
    cmd = [exe, "-p", ask]
    if mcp_config:
        cmd += ["--allowed-mcp-server-names", MCP_NAME]
    return cmd


def write_tool_config(provider: str, folder: Path, app_url: str, token: str) -> Path:
    """Config that starts mcp_server.py for this one run (inside the scratch folder)."""
    server = {"command": sys.executable, "args": [str(Path(__file__).resolve().parents[1] / "mcp_server.py")],
              "env": {"FM_URL": app_url, "FM_TOKEN": token}}
    if provider == "claude_cli":
        path = folder / "mcp.json"
        path.write_text(json.dumps({"mcpServers": {MCP_NAME: server}}), encoding="utf-8")
        return path
    gem = folder / ".gemini"
    gem.mkdir(exist_ok=True)
    path = gem / "settings.json"
    path.write_text(json.dumps({"mcpServers": {MCP_NAME: {**server, "trust": True, "timeout": 120000}},
                                "excludeTools": GEMINI_EXCLUDED}), encoding="utf-8")
    return path


def _popen_args(cmd: list[str]) -> list[str]:
    # npm installs .cmd/.ps1 shims on Windows; .cmd needs cmd.exe to run.
    if os.name == "nt" and cmd[0].lower().endswith((".cmd", ".bat")):
        return ["cmd.exe", "/c", *cmd]
    return cmd


def stream(provider: str, prompt: str, model: str | None = None, tools: dict | None = None,
           poll: Callable[[], list] | None = None) -> Iterator[tuple[str, object]]:
    """Yield ("text", chunk) as the CLI prints, anything `poll()` returns meanwhile (e.g. tool chips),
    then ("done", "") or ("error", message). tools = {"url": app url, "token": session token}."""
    scratch = Path(tempfile.mkdtemp(prefix="fm-ai-"))  # empty folder: nothing to read even if a tool slipped through
    try:
        cfg = write_tool_config(provider, scratch, tools["url"], tools["token"]) if tools else None
        try:
            cmd = command(provider, model, cfg)
        except FileNotFoundError:
            yield "error", f"The {CLI[provider]} command isn't installed. Install it with: {INSTALL[provider]}"
            return
        try:
            proc = subprocess.Popen(_popen_args(cmd), cwd=str(scratch), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")
        except OSError as e:
            yield "error", f"Couldn't start {CLI[provider]}: {e}"
            return
        timer = threading.Timer(TIMEOUT, proc.kill)
        timer.start()
        out_q: queue.Queue = queue.Queue()
        err_chunks: list[str] = []

        def read_out():
            while True:
                chunk = proc.stdout.read(64)
                if not chunk:
                    break
                out_q.put(chunk)
            out_q.put(None)

        threading.Thread(target=read_out, daemon=True).start()
        threading.Thread(target=lambda: err_chunks.append(proc.stderr.read()), daemon=True).start()
        try:
            proc.stdin.write(prompt)
            proc.stdin.close()
        except OSError:
            pass
        got = False
        try:
            while True:
                try:
                    chunk = out_q.get(timeout=0.3)
                except queue.Empty:
                    chunk = ""
                for ev in (poll() if poll else []):
                    yield ev
                if chunk is None:
                    break
                if chunk:
                    got = True
                    yield "text", chunk
            rc = proc.wait()
            for ev in (poll() if poll else []):
                yield ev
            time.sleep(0.05)
            if rc != 0 and not got:
                yield "error", friendly_error(provider, "".join(err_chunks), rc)
                return
            yield "done", ""
        finally:
            timer.cancel()
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


def friendly_error(provider: str, stderr: str, rc: int) -> str:
    s = (stderr or "").strip()
    low = s.lower()
    name = "Claude Code" if provider == "claude_cli" else "Gemini CLI"
    if rc in (-9, 137) or "killed" in low:
        return f"{name} took longer than {TIMEOUT // 60} minutes and was stopped. Try a shorter question."
    if any(w in low for w in ("login", "log in", "sign in", "authenticate", "not authenticated", "api key")):
        return f"{name} isn't signed in. Open a terminal, run  {CLI[provider]}  once and sign in, then try again."
    if "quota" in low or "rate limit" in low or "usage limit" in low:
        return f"{name} says you've hit your usage limit. Try again later."
    return f"{name} stopped with an error: {s[:300] or f'exit code {rc}'}"
