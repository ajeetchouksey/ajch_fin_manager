"""'Ask Claude' — a chat assistant that knows your finances.

Uses YOUR Anthropic API key (Settings tab or ANTHROPIC_API_KEY env var).
Claude can call the tools below: they read your local app data and run the
same calculators the app uses, so answers are grounded in your numbers.
Only the facts a tool returns (and what you type) are sent to the API.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Callable, Iterator

from . import compliance, ledger, planning, tax_de, tax_in, trading
from .db import DB

DEFAULT_MODEL = "claude-sonnet-5-5"
MODELS = {"claude-sonnet-5-5": "Sonnet 5.5 — fast, everyday",
          "claude-opus-5-5": "Opus 5.5 — deepest reasoning (costs more)",
          "claude-haiku-4-5-20251001": "Haiku 4.5 — quickest & cheapest"}

SYSTEM = """You are the finance and tax companion inside Ajeet's personal Finance Manager app.

Who you're talking to: Ajeet lives and works in Frankfurt, Germany (employee), is married with one child, and has financial ties to India, including an under-construction flat in Pune (Gera Island of Joy 1A-806). He is NOT a finance expert.

How to answer:
- Plain English first. Short sentences. Define any jargon the first time (e.g. "zvE — your taxable income after deductions"). Use a small concrete example with his own numbers when it helps.
- Lead with the answer or the action, then the why. Use short bullet lists or a small table when comparing options; no walls of text.
- Always ground answers in his data: call get_financial_snapshot / list_deadlines before answering questions about his situation, and use the calculator tools for any tax or savings figure. Never do tax arithmetic in your head.
- Amounts: € for Germany, ₹ with lakh grouping (₹51,67,109) for India. Say which currency.
- If data is missing (e.g. no bank balances entered), say what's missing and how to add it in the app (tab name + button).

Your role as tax consultant (Germany + India):
- Treat him as German tax resident and most likely an Indian NRI unless he says otherwise. Germany taxes worldwide income; India taxes Indian-source income; the India-Germany DTAA gives credit.
- Be proactive about compliance: if a deadline within ~45 days or a 'critical' item is open, mention it briefly even if not asked.
- Be precise about what is certain vs an estimate. For filings, corrections, penalties, or anything irreversible, recommend confirming with a Steuerberater / Chartered Accountant — once, briefly, not in every message.
- Rules change: if a question depends on a rule you're unsure is current (after mid-2026), use web search if available and cite the source.

Investing & trading:
- He tracks investments and paper-trades; there is NO live trading. Explain risk honestly (drawdowns, fees, ~26% German tax on gains). Never promise returns. Don't recommend specific individual stocks as buys; you can explain how products work (ETFs, SIPs, FDs, PPF, etc.) and trade-offs.
- Not a licensed financial adviser: give factual information and options so he can decide.

Changing data: only use save_goal / add_account / add_expense / update_deadline when he asks you to (or clearly agrees). Confirm what you changed in one line.

Today is {today}."""

TOOLS = [
    {"name": "get_financial_snapshot",
     "description": "Ajeet's current position from the app: net worth (EUR), assets/debts list, holdings, goals with on-track status, monthly cash flow, Gera flat payment/TDS status, latest payslip, FX rate. Call this before answering anything about his situation.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "list_deadlines",
     "description": "Tax & compliance calendar (Germany + India) with due dates, severity, status and detailed 'what & how'.",
     "input_schema": {"type": "object", "properties": {
         "country": {"type": "string", "enum": ["DE", "IN", "all"]},
         "include_done": {"type": "boolean"}}}},
    {"name": "german_income_tax",
     "description": "German income tax (§32a EStG) + Soli + church tax on taxable income (zvE). Years 2023-2026.",
     "input_schema": {"type": "object", "required": ["zve"], "properties": {
         "zve": {"type": "number"}, "year": {"type": "integer"}, "joint": {"type": "boolean"}, "church": {"type": "boolean"}}}},
    {"name": "german_refund_estimate",
     "description": "Estimate German refund/back-payment from Lohnsteuerbescheinigung figures and deductions.",
     "input_schema": {"type": "object", "required": ["gross", "lohnsteuer"], "properties": {
         "year": {"type": "integer"}, "gross": {"type": "number"}, "lohnsteuer": {"type": "number"},
         "soli_paid": {"type": "number"}, "kist_paid": {"type": "number"},
         "werbungskosten": {"type": "number", "description": "work expenses; min 1230 applied"},
         "vorsorge": {"type": "number", "description": "deductible pension/health insurance"},
         "sonderausgaben": {"type": "number"}, "joint": {"type": "boolean"}, "church": {"type": "boolean"}}}},
    {"name": "german_investment_tax",
     "description": "German flat tax (Abgeltungsteuer) on interest/dividends/gains incl. Sparer-Pauschbetrag and ETF Teilfreistellung.",
     "input_schema": {"type": "object", "required": ["gains"], "properties": {
         "gains": {"type": "number"}, "joint": {"type": "boolean"}, "church": {"type": "boolean"}, "equity_etf": {"type": "boolean"}}}},
    {"name": "india_tax_compare",
     "description": "Indian income tax, new vs old regime, resident or NRI (FY 2025-26 / 2026-27 slabs). Amounts in INR.",
     "input_schema": {"type": "object", "properties": {
         "resident": {"type": "boolean"}, "salary": {"type": "number"}, "other_income": {"type": "number"},
         "stcg_equity": {"type": "number"}, "ltcg_equity": {"type": "number"}, "ded_80c": {"type": "number"},
         "ded_80d": {"type": "number"}, "home_loan_interest": {"type": "number"}, "other_deductions": {"type": "number"}}}},
    {"name": "plan_goal",
     "description": "What-if savings plan: required monthly saving, projected value, on-track verdict. Does NOT save.",
     "input_schema": {"type": "object", "required": ["name", "target_today", "target_date"], "properties": {
         "name": {"type": "string"}, "target_today": {"type": "number"}, "currency": {"type": "string", "enum": ["EUR", "INR"]},
         "target_date": {"type": "string", "description": "YYYY-MM-DD"}, "saved": {"type": "number"},
         "monthly": {"type": "number"}, "annual_return": {"type": "number", "description": "0.05 = 5%"},
         "inflation": {"type": "number", "description": "0.02 = 2%"}}}},
    {"name": "save_goal",
     "description": "Create or update a goal in the app (only when the user asks). Pass id to update.",
     "input_schema": {"type": "object", "required": ["name", "target_today", "target_date"], "properties": {
         "id": {"type": "integer"}, "name": {"type": "string"}, "target_today": {"type": "number"},
         "currency": {"type": "string", "enum": ["EUR", "INR"]}, "target_date": {"type": "string"},
         "saved": {"type": "number"}, "monthly": {"type": "number"}, "annual_return": {"type": "number"},
         "inflation": {"type": "number"}, "priority": {"type": "integer"}, "note": {"type": "string"}}}},
    {"name": "add_account",
     "description": "Add or update an asset/debt (bank balance, FD, EPF, loan...) in the app (only when asked). Pass id to update.",
     "input_schema": {"type": "object", "required": ["name", "kind", "category", "amount", "currency"], "properties": {
         "id": {"type": "integer"}, "name": {"type": "string"}, "kind": {"type": "string", "enum": ["asset", "liability"]},
         "category": {"type": "string"}, "amount": {"type": "number"}, "currency": {"type": "string", "enum": ["EUR", "INR"]},
         "liquid": {"type": "boolean"}, "country": {"type": "string", "enum": ["DE", "IN"]}, "note": {"type": "string"}}}},
    {"name": "add_transaction",
     "description": "Log income, an expense or a transfer in one of Ajeet's accounts (Money tab). Only when he asks. Use account ids from get_financial_snapshot. Optional frequency makes it repeat.",
     "input_schema": {"type": "object", "required": ["kind", "account_id", "amount"], "properties": {
         "kind": {"type": "string", "enum": ["income", "expense", "transfer"]}, "account_id": {"type": "integer"},
         "amount": {"type": "number", "description": "in the account's own currency"}, "category": {"type": "string"},
         "date": {"type": "string", "description": "YYYY-MM-DD, default today"}, "note": {"type": "string"},
         "to_account_id": {"type": "integer"}, "to_amount": {"type": "number"},
         "frequency": {"type": "string", "enum": ["daily", "weekly", "monthly", "quarterly", "yearly"]}, "end_date": {"type": "string"}}}},
    {"name": "add_expense",
     "description": "Add a monthly spending category in EUR (only when asked).",
     "input_schema": {"type": "object", "required": ["category", "amount"], "properties": {
         "category": {"type": "string"}, "amount": {"type": "number"}, "note": {"type": "string"}}}},
    {"name": "update_deadline",
     "description": "Mark a compliance item done/open (only when asked). Use the id from list_deadlines.",
     "input_schema": {"type": "object", "required": ["id", "status"], "properties": {
         "id": {"type": "integer"}, "status": {"type": "string", "enum": ["open", "done"]}}}},
    {"name": "run_backtest",
     "description": "Backtest a strategy on historical prices (paper only). ticker like VWCE.DE, ^NSEI, or DEMO for synthetic data.",
     "input_schema": {"type": "object", "required": ["ticker"], "properties": {
         "ticker": {"type": "string"}, "strategy": {"type": "string", "enum": list(trading.STRATEGIES)},
         "years": {"type": "integer"}}}},
]
WEB_SEARCH_TOOL = {"type": "web_search_20250305", "name": "web_search", "max_uses": 3}

TOOL_LABELS = {
    "get_financial_snapshot": "Looked at your finances", "list_deadlines": "Checked your tax calendar",
    "german_income_tax": "Ran German tax calculator", "german_refund_estimate": "Estimated German refund",
    "german_investment_tax": "Calculated German investment tax", "india_tax_compare": "Compared Indian tax regimes",
    "plan_goal": "Ran a savings plan", "save_goal": "Saved a goal", "add_account": "Updated an account",
    "add_expense": "Added spending", "add_transaction": "Logged an entry", "update_deadline": "Updated a deadline", "run_backtest": "Ran a backtest",
    "web_search": "Searched the web",
}


class Toolbox:
    def __init__(self, db: DB, planner_root: Path, holding_items: Callable[[], list]):
        self.db, self.root, self.holding_items = db, planner_root, holding_items

    def _fx(self):
        return float(self.db.settings().get("fx_inr_per_eur", 100))

    def run(self, name: str, args: dict):
        fn = getattr(self, "t_" + name, None)
        if not fn:
            return {"error": f"unknown tool {name}"}
        try:
            return fn(**(args or {}))
        except Exception as e:  # noqa: BLE001 — report to the model, don't crash the chat
            return {"error": f"{type(e).__name__}: {e}"}

    def t_get_financial_snapshot(self):
        fx = self._fx()
        items = self.db.list("items")
        nw = planning.net_worth(items + self.holding_items(), fx)
        facts = compliance.load_facts(self.root_fn() if getattr(self, "root_fn", None) else self.root)
        goals = []
        for g in self.db.list("goals", "priority, target_date"):
            r = planning.plan_goal(g["name"], g["target_today"], date.fromisoformat(g["target_date"]), g["saved"],
                                   g["monthly"], g["annual_return"], g["inflation"], g["currency"])
            goals.append({"id": g["id"], "name": g["name"], "currency": g["currency"], "target_today": g["target_today"],
                          "target_date": g["target_date"], "saved": g["saved"], "monthly": g["monthly"],
                          "required_monthly": r["required_monthly"], "status": r["verdict"], "note": g["note"]})
        s = self.db.settings()
        ps = compliance.payslip_summary(facts)
        income = float(s.get("monthly_income_eur") or ps["latest_net_eur"] or 0)
        cf = planning.cash_flow(income, self.db.list("expenses"), nw["liquid_eur"])
        return {"fx_inr_per_eur": fx, "net_worth": nw,
                "accounts": [{k: i[k] for k in ("id", "name", "kind", "category", "amount", "currency", "liquid", "updated")} for i in items],
                "holdings": self.db.list("holdings"), "goals": goals,
                "bank_accounts": [{k: a[k] for k in ("id", "name", "country", "currency", "type", "balance")} for a in ledger.balances(self.db) if not a["archived"]],
                "this_month": {k: v for k, v in ledger.summary(self.db, "month", date.today(), "EUR", fx).items() if k in ("income", "expense", "net", "by_category")},
                "monthly_cash_flow": cf | {"income_source": "settings" if s.get("monthly_income_eur") else f"payslip {ps['latest_period']}"},
                "expenses": self.db.list("expenses"),
                "gera_flat": compliance.gera_summary(facts),
                "payslips_on_file": {"count": ps["count"], "latest_period": ps["latest_period"], "latest_net_eur": ps["latest_net_eur"]},
                "today": date.today().isoformat()}

    def t_list_deadlines(self, country: str = "all", include_done: bool = False):
        out = []
        for c in self.db.list("calendar", "due IS NULL, due"):
            if country in ("DE", "IN") and c["country"] != country:
                continue
            if c["status"] == "done" and not include_done:
                continue
            d = (date.fromisoformat(c["due"]) - date.today()).days if c["due"] else None
            out.append({"id": c["id"], "due": c["due"], "days_left": d, "country": c["country"], "severity": c["severity"],
                        "status": c["status"], "title": c["title"], "detail": c["detail"], "source": c["source"]})
        return {"today": date.today().isoformat(), "items": out}

    def t_german_income_tax(self, zve, year=2026, joint=True, church=False):
        return tax_de.calculate(float(zve), int(year), bool(joint), bool(church))

    def t_german_refund_estimate(self, gross, lohnsteuer, year=2025, soli_paid=0, kist_paid=0, werbungskosten=0,
                                 vorsorge=0, sonderausgaben=0, joint=True, church=False):
        wk = max(float(werbungskosten), 1230)
        zve = max(float(gross) - wk - float(vorsorge) - float(sonderausgaben), 0)
        r = tax_de.calculate(zve, int(year), bool(joint), bool(church))
        withheld = float(lohnsteuer) + float(soli_paid) + float(kist_paid)
        return r | {"zve": zve, "werbungskosten_used": wk, "withheld": withheld, "refund": round(withheld - r["total"], 2),
                    "caveat": "Simplified: ignores child allowances, Vorsorge caps and Progressionsvorbehalt."}

    def t_german_investment_tax(self, gains, joint=True, church=False, equity_etf=False):
        return tax_de.capital_gains_tax(float(gains), bool(joint), bool(church), bool(equity_etf))

    def t_india_tax_compare(self, resident=False, **kw):
        keys = ["salary", "other_income", "ded_80c", "ded_80d", "home_loan_interest", "other_deductions", "stcg_equity", "ltcg_equity"]
        return tax_in.compare(resident=bool(resident), **{k: float(kw.get(k, 0) or 0) for k in keys})

    def t_plan_goal(self, name, target_today, target_date, currency="EUR", saved=0, monthly=0, annual_return=0.05, inflation=0.02):
        r = planning.plan_goal(name, float(target_today), date.fromisoformat(target_date), float(saved), float(monthly),
                               float(annual_return), float(inflation), currency)
        r.pop("path", None)
        return r

    def t_save_goal(self, **g):
        g.setdefault("currency", "EUR"); g.setdefault("annual_return", 0.05); g.setdefault("inflation", 0.02)
        g.setdefault("saved", 0); g.setdefault("monthly", 0); g.setdefault("priority", 2)
        if g.get("id"):
            old = next((x for x in self.db.list("goals") if x["id"] == g["id"]), None)
            if old:
                g = old | {k: v for k, v in g.items() if v is not None}
        return {"saved_goal_id": self.db.upsert("goals", g)}

    def t_add_account(self, **i):
        i["liquid"] = 1 if i.get("liquid") else 0
        i.setdefault("country", "IN" if i.get("currency") == "INR" else "DE")
        i["updated"] = date.today().isoformat()
        return {"saved_item_id": self.db.upsert("items", i)}

    def t_add_transaction(self, kind, account_id, amount, category=None, date=None, note=None, to_account_id=None,
                          to_amount=None, frequency=None, end_date=None):
        from datetime import date as _d
        accts = {a["id"]: a for a in self.db.list("accounts")}
        if account_id not in accts:
            return {"error": "unknown account_id — call get_financial_snapshot for ids"}
        if kind == "transfer":
            if to_account_id not in accts:
                return {"error": "transfer needs to_account_id"}
            if to_amount is None:
                to_amount = round(ledger.to_ccy(amount, accts[account_id]["currency"], accts[to_account_id]["currency"], self._fx()), 2)
        row = {"kind": kind, "account_id": account_id, "amount": amount, "category": category, "note": note,
               "to_account_id": to_account_id if kind == "transfer" else None, "to_amount": to_amount if kind == "transfer" else None}
        when = date or _d.today().isoformat()
        if frequency:
            rid = self.db.upsert("recurring", {**row, "frequency": frequency, "start_date": when, "end_date": end_date, "active": 1})
            ledger.materialize_recurring(self.db)
            return {"saved_recurring_id": rid, "currency": accts[account_id]["currency"]}
        return {"saved_transaction_id": self.db.upsert("transactions", {**row, "date": when}), "currency": accts[account_id]["currency"]}

    def t_add_expense(self, **e):
        return {"saved_expense_id": self.db.upsert("expenses", e)}

    def t_update_deadline(self, id, status):
        row = next((c for c in self.db.list("calendar") if c["id"] == id), None)
        if not row:
            return {"error": "no such deadline"}
        row["status"] = status
        self.db.upsert("calendar", row)
        return {"ok": True, "title": row["title"], "status": status}

    def t_run_backtest(self, ticker, strategy="sma_cross", years=10):
        if ticker.upper() == "DEMO":
            p = trading.synthetic_prices(int(years))
        else:
            p = trading.fetch_prices(ticker, f"{date.today().year - int(years)}-01-01")
        r = trading.backtest(p, strategy)
        r.pop("series", None)
        return r


SYSTEM_GENERIC = """You are the finance companion inside a personal Finance Manager app.

Who you're talking to: {name}. Countries they have money or tax ties in: {countries}. Currencies: {currencies}; home currency {home}. Assume they are NOT a finance expert unless they say otherwise.

How to answer:
- Plain English first, short sentences. Define jargon the first time you use it. Lead with the answer or action, then the why.
- Ground answers in their data: call get_financial_snapshot / list_deadlines when tools are available, and use calculator tools for tax or savings figures. Never invent numbers.
- If data is missing, say what's missing and where to add it in the app (tab name + button).
- Tax: the app has tax rules for Germany and India only. For other countries explain general principles and say clearly that details must be checked locally. Recommend a qualified tax adviser for filings or anything with penalties — once, briefly.
- Investing: no live trading. Explain risk honestly, never promise returns, don't recommend individual stocks as buys. You are not a licensed financial adviser.

Changing data: only use save_goal / add_account / add_expense / update_deadline when they ask (or clearly agree). Confirm what you changed in one line.

Today is {today}."""


def system_prompt(profile: dict | None) -> str:
    today = date.today().strftime("%A %d %B %Y")
    if not profile or profile.get("legacy"):
        return SYSTEM.format(today=today)
    from .profiles import COUNTRIES
    return SYSTEM_GENERIC.format(
        name=profile.get("name") or "the user",
        countries=", ".join(COUNTRIES.get(c, c) for c in profile.get("countries") or []) or "not set",
        currencies=", ".join(profile.get("currencies") or []) or "not set",
        home=profile.get("home_currency") or "EUR", today=today)


# ---------------------------------------------------------------- streaming
def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def chat_stream(client, model: str, history: list[dict], toolbox: Toolbox, web_search: bool = True,
                on_message: Callable[[dict], None] | None = None, system: str | None = None) -> Iterator[str]:
    """Run the tool loop, yielding SSE strings. `history` is the API messages list (mutated).
    on_message is called with every new assistant/user(tool_result) message so it can be stored."""
    _sanitize(history)
    system = system or SYSTEM.format(today=date.today().strftime("%A %d %B %Y"))
    tools = TOOLS + ([WEB_SEARCH_TOOL] if web_search else [])
    for _ in range(12):  # max tool rounds
        try:
            with client.messages.stream(model=model, max_tokens=4096, system=system, messages=history, tools=tools) as stream:
                for ev in stream:
                    if ev.type == "content_block_start":
                        b = ev.content_block
                        if b.type in ("tool_use", "server_tool_use"):
                            yield _sse("tool", {"name": b.name, "label": TOOL_LABELS.get(b.name, b.name)})
                    elif ev.type == "content_block_delta" and ev.delta.type == "text_delta":
                        yield _sse("text", {"t": ev.delta.text})
                final = stream.get_final_message()
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            if web_search and "web_search" in msg:
                web_search, tools = False, TOOLS  # org may not allow it — retry without
                continue
            yield _sse("error", {"message": _friendly_error(e)})
            return
        content = [b.model_dump(exclude_none=True) for b in final.content]
        amsg = {"role": "assistant", "content": content}
        history.append(amsg)
        if on_message:
            on_message(amsg)
        if final.stop_reason != "tool_use":
            yield _sse("done", {"usage": {"in": final.usage.input_tokens, "out": final.usage.output_tokens}})
            return
        results = []
        for b in final.content:
            if b.type == "tool_use":
                out = toolbox.run(b.name, b.input)
                results.append({"type": "tool_result", "tool_use_id": b.id,
                                "content": json.dumps(out, ensure_ascii=False, default=str)[:60000],
                                **({"is_error": True} if isinstance(out, dict) and "error" in out else {})})
                yield _sse("tool_done", {"name": b.name, "label": TOOL_LABELS.get(b.name, b.name),
                                         "changed": b.name in ("save_goal", "add_account", "add_expense", "add_transaction", "update_deadline")})
        umsg = {"role": "user", "content": results}
        history.append(umsg)
        if on_message:
            on_message(umsg)
        yield _sse("text", {"t": "\n\n"})
    yield _sse("done", {})


def _sanitize(history: list[dict]) -> None:
    """Repair histories broken by an interrupted request, in place:
    drop assistant tool_use turns that never got results, merge back-to-back user texts."""
    fixed = []
    for i, m in enumerate(history):
        nxt = history[i + 1] if i + 1 < len(history) else None
        if m["role"] == "assistant" and any(b.get("type") == "tool_use" for b in m["content"]):
            if not (nxt and nxt["role"] == "user" and isinstance(nxt["content"], list)):
                continue
        if m["role"] == "user" and isinstance(m["content"], list):
            if not (fixed and fixed[-1]["role"] == "assistant"):
                continue  # orphaned tool results
        if fixed and fixed[-1]["role"] == m["role"] == "user" and isinstance(m["content"], str) \
                and isinstance(fixed[-1]["content"], str):
            fixed[-1] = {"role": "user", "content": fixed[-1]["content"] + "\n\n" + m["content"]}
            continue
        if fixed and fixed[-1]["role"] == m["role"] == "assistant":
            fixed[-1] = {"role": "assistant", "content": fixed[-1]["content"] + m["content"]}
            continue
        fixed.append(m)
    history[:] = fixed


def _friendly_error(e: Exception) -> str:
    s = str(e)
    if "authentication" in s.lower() or "401" in s or "api_key" in s.lower():
        return "Your Anthropic API key was rejected. Check it in Settings → Claude."
    if "credit" in s.lower() or "billing" in s.lower():
        return "Your Anthropic account has no credit left. Top up at console.anthropic.com."
    if "not_found" in s or "model" in s.lower() and "404" in s:
        return "That model isn't available on your API key — pick another in Settings → Claude."
    if "overloaded" in s.lower() or "529" in s:
        return "Claude is busy right now — try again in a moment."
    return f"Something went wrong talking to Claude: {s[:300]}"


def display_messages(history: list[dict]) -> list[dict]:
    """Flatten stored API messages into what the UI shows: user text, assistant text + tool chips."""
    out = []
    for m in history:
        if m["role"] == "user":
            if isinstance(m["content"], str):
                out.append({"role": "user", "text": m["content"]})
            continue  # tool_result turns aren't shown
        text, tools = "", []
        for b in m["content"]:
            if b.get("type") == "text":
                text += b.get("text", "")
            elif b.get("type") in ("tool_use", "server_tool_use"):
                tools.append(TOOL_LABELS.get(b["name"], b["name"]))
        if out and out[-1]["role"] == "assistant":  # merge tool rounds into one bubble
            out[-1]["text"] += ("\n\n" if out[-1]["text"] and text else "") + text
            out[-1]["tools"] += tools
        else:
            out.append({"role": "assistant", "text": text, "tools": tools})
    return out
