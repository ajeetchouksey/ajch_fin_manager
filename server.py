"""Finance Manager — local web app.

Run:  python server.py          then open http://127.0.0.1:8770
Everything runs on your laptop; data lives in data/finance.db.
The only internet calls are optional price/FX refreshes you trigger yourself.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import sys
import threading
import time
from datetime import date, datetime
from pathlib import Path
from urllib.parse import quote as _urlquote

from fastapi import Body, FastAPI, HTTPException
from fastapi import Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from fincore import ai_cli, assistant, compliance, docs, gdrive, ledger, planning, profiles, tax_de, tax_in, trading  # noqa: E402
from fincore.db import DB, TABLES  # noqa: E402

PLANNER_ROOT = Path(os.environ.get("PLANNER_ROOT", HERE.parent))
TOOLS_DIR = HERE.parent / "tools"
LEGACY_DB = Path(os.environ.get("FINANCE_DB", HERE / "data" / "finance.db"))
PROFILES = profiles.Profiles(LEGACY_DB.parent, LEGACY_DB, PLANNER_ROOT)
PORT = int(os.environ.get("PORT", 8770))
_dbs: dict[str, DB] = {}


def _profile() -> dict:
    p = PROFILES.active()
    if not p:
        raise HTTPException(409, "Pick or add a user first.")
    return p


def _db_for(p: dict) -> DB:
    d = _dbs.get(p["id"])
    if d is None:
        d = DB(Path(p["db"]))
        if p.get("legacy"):  # the original user's Gera/TDS calendar and seed goals
            d.seed_calendar(compliance.SEED)
            d.seed_once("seeded_v1", _seed)
        _dbs[p["id"]] = d
    return d


class _ActiveDB:
    """`db` everywhere in this file means: the database of the user who is currently selected."""

    def __getattr__(self, name):
        return getattr(_db_for(_profile()), name)


db = _ActiveDB()


def _home() -> Path:
    """Per-user app data folder (inbox, Google Drive working copy)."""
    p = _profile()
    return Path(p["db"]).parent


def _gcache() -> Path:
    return _home() / "gdrive_cache"


def _inbox() -> Path:
    return _home() / "inbox"


def _docs_root() -> Path:
    return Path(_profile().get("docs_root") or PLANNER_ROOT)


def _drive_on() -> bool:
    s = db.settings()
    return s.get("doc_source") == "gdrive" and bool(s.get("gdrive_refresh_token")) and bool(s.get("gdrive_folder_id"))


def _root() -> Path:
    """Where documents and facts/ live: the planner folder, or the Google Drive working copy."""
    return _gcache() if _drive_on() else _docs_root()


def _seed(d: DB):
    g = compliance.gera_summary(compliance.load_facts(_docs_root()))
    d.upsert("items", {"name": "Gera flat 1A-806 — consideration paid to date (at cost)", "kind": "asset",
                       "category": "Property (under construction)", "amount": g["paid_consideration"],
                       "currency": "INR", "liquid": 0, "country": "IN",
                       "note": "Stages 01–10 per TDS_Tracker.md. Excludes GST & stamp duty (costs, not value).",
                       "updated": date.today().isoformat()})
    d.upsert("goals", {"name": "Finish paying Gera flat (stages 11–17 + 5% GST)", "target_today": g["remaining_with_gst"],
                       "currency": "INR", "target_date": "2027-12-31", "saved": 0, "monthly": 0,
                       "annual_return": 0.065, "inflation": 0.0, "priority": 1,
                       "note": "₹49,21,056 consideration + GST. Timing follows Gera's slab invoices (≈₹7.4L each). "
                               "Excludes the ₹2.62L DG admin charge until Gera explains it. Set 'saved' to what you've set aside."})
    d.upsert("goals", {"name": "Emergency fund (6 months of spending)", "target_today": 30000, "currency": "EUR",
                       "target_date": f"{date.today().year + 1}-06-30", "saved": 0, "monthly": 0,
                       "annual_return": 0.02, "inflation": 0.02, "priority": 1,
                       "note": "Placeholder — set target to 6 × your monthly spending from the Plan tab."})



app = FastAPI(title="Finance Manager")


def _fx() -> float:
    return float(db.settings().get("fx_inr_per_eur", 100))


def _account_items() -> list[dict]:
    """Ledger accounts as net-worth lines (negative balances count as debts)."""
    out = []
    for a in ledger.balances(db):
        if a["archived"] or not a["in_networth"]:
            continue
        b = a["balance"]
        out.append({"name": a["name"], "kind": "asset" if b >= 0 else "liability",
                    "category": f"Accounts · {a['type']}", "amount": abs(b), "currency": a["currency"],
                    "liquid": 1 if (a["liquid"] and b >= 0) else 0})
    return out


def _holding_items() -> list[dict]:
    out = _account_items()
    for h in db.list("holdings"):
        px = h["last_price"] or h["avg_cost"] or 0
        out.append({"name": h["name"], "kind": "asset", "category": f"Investments · {h['asset_type']}",
                    "amount": (h["qty"] or 0) * px, "currency": h["currency"], "liquid": 0})
    return out


# ---------------- data CRUD ----------------
# ---------------- money: accounts, transactions, recurring ----------------
@app.get("/money/meta")
def money_meta():
    return {"income_categories": ledger.INCOME_CATEGORIES, "expense_categories": ledger.EXPENSE_CATEGORIES,
            "account_types": ledger.ACCOUNT_TYPES, "frequencies": ledger.FREQUENCIES, "fx": _fx()}


@app.get("/money/accounts")
def money_accounts():
    ledger.materialize_recurring(db)
    accts = [a for a in ledger.balances(db) if not a["archived"]]
    fx = _fx()
    tot = {"EUR": 0.0, "INR": 0.0}
    for a in accts:
        tot[a["currency"]] = tot.get(a["currency"], 0) + a["balance"]
    rec = []
    for r in db.list("recurring"):
        nxt = next((d for d in ledger.occurrences(date.fromisoformat(r["start_date"]), r["frequency"], date(2100, 1, 1),
                                                     date.fromisoformat(r["end_date"]) if r["end_date"] else None)
                    if d > date.today()), None) if r["active"] else None
        rec.append(dict(r, next=nxt.isoformat() if nxt else None))
    return {"accounts": accts, "recurring": rec, "totals": {k: round(v, 2) for k, v in tot.items()},
            "total_eur": round(tot["EUR"] + tot["INR"] / fx, 2), "total_inr": round(tot["INR"] + tot["EUR"] * fx, 2), "fx": fx}


@app.get("/money/summary")
def money_summary(period: str = "month", anchor: str | None = None, display: str = "EUR", account: int | None = None):
    ledger.materialize_recurring(db)
    a = date.fromisoformat(anchor) if anchor else date.today()
    return ledger.summary(db, period, a, display, _fx(), account)


@app.get("/api/{table}")
def list_rows(table: str):
    if table not in TABLES:
        raise HTTPException(404)
    return db.list(table, "due IS NULL, due" if table == "calendar" else "id")


@app.post("/api/{table}")
def save_row(table: str, row: dict = Body(...)):
    if table not in TABLES:
        raise HTTPException(404)
    if table == "items":
        row["updated"] = date.today().isoformat()
    if table == "paper_trades":
        row.setdefault("ts", datetime.now().isoformat(timespec="seconds"))
        _check_paper_trade(row)
    if table in ("transactions", "recurring"):
        _check_money_row(table, row)
    rid = db.upsert(table, row)
    if table == "recurring":
        ledger.materialize_recurring(db)
    return {"id": rid}


def _check_money_row(table: str, row: dict):
    accts = {a["id"]: a for a in db.list("accounts")}
    if int(row.get("account_id") or 0) not in accts:
        raise HTTPException(400, "Pick an account first (add one under Money → Accounts).")
    if float(row.get("amount") or 0) <= 0:
        raise HTTPException(400, "Amount must be more than zero.")
    if row.get("kind") == "transfer":
        to = int(row.get("to_account_id") or 0)
        if to not in accts or to == int(row["account_id"]):
            raise HTTPException(400, "A transfer needs a different 'to' account.")
        if not row.get("to_amount"):
            row["to_amount"] = round(ledger.to_ccy(float(row["amount"]), accts[int(row["account_id"])]["currency"],
                                                   accts[to]["currency"], _fx()), 2)
    else:
        row["to_account_id"] = None
        row["to_amount"] = None
    if table == "transactions":
        row.setdefault("created", datetime.now().isoformat(timespec="seconds"))


@app.delete("/api/{table}/{row_id}")
def delete_row(table: str, row_id: int):
    if table not in TABLES:
        raise HTTPException(404)
    db.delete(table, row_id)
    return {"ok": True}


def _public_settings():
    s = db.settings()
    key = s.pop("anthropic_api_key", "") or os.environ.get("ANTHROPIC_API_KEY", "")
    s["anthropic_key_set"] = bool(key)
    s["anthropic_key_hint"] = ("…" + key[-4:]) if key else ""
    for k in ("gdrive_client_secret", "gdrive_refresh_token", "gdrive_oauth_state", "gdrive_oauth_verifier"):
        s.pop(k, None)
    return s


@app.get("/api-settings")
def get_settings():
    return _public_settings()


@app.post("/api-settings")
def put_settings(s: dict = Body(...)):
    for k, v in s.items():
        if k.startswith("gdrive_") or k == "doc_source":
            continue  # Google Drive settings go through /gdrive/*
        if k == "anthropic_api_key" and not str(v).strip():
            continue  # blank = keep the existing key
        db.set_setting(k, str(v).strip() if k == "anthropic_api_key" else v)
    return _public_settings()


# ---------------- position / plan ----------------
@app.get("/calc/position")
def position():
    items = db.list("items") + _holding_items()
    nw = planning.net_worth(items, _fx())
    db.snapshot(nw)
    facts = compliance.load_facts(_root())
    return {"net_worth": nw, "fx": _fx(), "history": db.snapshots(),
            "gera": compliance.gera_summary(facts), "payslips": compliance.payslip_summary(facts),
            "open_deadlines": [c for c in db.list("calendar", "due IS NULL, due")
                               if c["status"] == "open" and c["due"]][:5]}


@app.get("/calc/goals")
def goals():
    out = []
    for g in db.list("goals", "priority, target_date"):
        r = planning.plan_goal(g["name"], g["target_today"], date.fromisoformat(g["target_date"]), g["saved"],
                               g["monthly"], g["annual_return"], g["inflation"], g["currency"])
        r.update(id=g["id"], priority=g["priority"], note=g["note"])
        out.append(r)
    fx = _fx()
    need_eur = sum(planning.to_eur(r["required_monthly"], r["currency"], fx) for r in out)
    return {"goals": out, "total_required_monthly_eur": round(need_eur, 2)}


@app.get("/calc/cashflow")
def cashflow():
    s = db.settings()
    facts = compliance.load_facts(_root())
    ps = compliance.payslip_summary(facts)
    income = float(s.get("monthly_income_eur") or ps["latest_net_eur"] or 0)
    nw = planning.net_worth(db.list("items") + _holding_items(), _fx())
    cf = planning.cash_flow(income, db.list("expenses"), nw["liquid_eur"])
    cf["actuals"] = ledger.monthly_actuals_eur(db, _fx())
    cf["income_source"] = "your setting" if s.get("monthly_income_eur") else (
        f"latest payslip on file ({ps['latest_period']}) — update in Settings" if ps["latest_net_eur"] else "not set")
    return cf


# ---------------- tax ----------------
@app.post("/calc/tax/de")
def tax_de_calc(p: dict = Body(...)):
    return tax_de.calculate(float(p["zve"]), int(p.get("year", 2026)), bool(p.get("joint")), bool(p.get("church")))


@app.post("/calc/tax/de/refund")
def tax_de_refund(p: dict = Body(...)):
    """Estimate refund: tax on (gross - deductions) vs Lohnsteuer withheld."""
    year, joint, church = int(p.get("year", 2025)), bool(p.get("joint")), bool(p.get("church"))
    gross = float(p.get("gross", 0))
    wk = max(float(p.get("werbungskosten", 0)), 1230)  # Arbeitnehmer-Pauschbetrag
    vorsorge = float(p.get("vorsorge", 0))  # pension/health insurance deductible part
    other = float(p.get("sonderausgaben", 0)) + float(p.get("other_deductions", 0))
    zve = max(gross - wk - vorsorge - other, 0)
    r = tax_de.calculate(zve, year, joint, church)
    withheld = float(p.get("lohnsteuer", 0)) + float(p.get("soli_paid", 0)) + float(p.get("kist_paid", 0))
    r["withheld"] = withheld
    r["refund"] = round(withheld - r["total"], 2)
    r["zve_breakdown"] = {"gross": gross, "werbungskosten": wk, "vorsorge": vorsorge, "other": other, "zve": zve}
    r["explanation"] = (
        f"Your taxable income comes out at €{zve:,.0f}. Tax on that is about €{r['total']:,.0f}; your employer withheld "
        f"€{withheld:,.0f}. " + (f"Estimated REFUND ≈ €{r['refund']:,.0f}." if r["refund"] >= 0
                                 else f"Estimated BACK-PAYMENT ≈ €{-r['refund']:,.0f} (normal with class III/V).")
        + " Rough estimate: ELSTER's result will differ by allowances for children, Vorsorge caps, etc.")
    return r


@app.post("/calc/tax/de/capital")
def tax_de_cap(p: dict = Body(...)):
    return tax_de.capital_gains_tax(float(p["gains"]), bool(p.get("joint")), bool(p.get("church")),
                                    bool(p.get("equity_etf")))


@app.post("/calc/tax/in")
def tax_in_calc(p: dict = Body(...)):
    keys = ["salary", "other_income", "ded_80c", "ded_80d", "home_loan_interest", "other_deductions",
            "stcg_equity", "ltcg_equity"]
    kw = {k: float(p.get(k, 0) or 0) for k in keys}
    return tax_in.compare(resident=bool(p.get("resident", False)), **kw)


# ---------------- invest / learn ----------------
def _prices(p: dict):
    if p.get("csv"):
        return trading.prices_from_csv(p["csv"]), "your CSV"
    t = (p.get("ticker") or "DEMO").strip()
    if t.upper() == "DEMO":
        return trading.synthetic_prices(int(p.get("years", 10))), "demo random data (not a real market)"
    start = f"{date.today().year - int(p.get('years', 10))}-01-01"
    try:
        return trading.fetch_prices(t, start), f"Yahoo Finance ({t})"
    except ImportError:
        raise HTTPException(400, "yfinance not installed — run install.bat again, or use ticker DEMO / upload a CSV")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Couldn't load prices for {t}: {e}")


@app.post("/calc/backtest")
def backtest(p: dict = Body(...)):
    prices, src = _prices(p)
    params = {k: int(v) for k, v in (p.get("params") or {}).items() if str(v).strip()}
    r = trading.backtest(prices, p.get("strategy", "sma_cross"), float(p.get("capital", 10000)),
                         float(p.get("cost_pct", 0.001)), params)
    r["source"] = src
    return r


@app.post("/calc/sip")
def sip(p: dict = Body(...)):
    prices, src = _prices(p)
    r = trading.sip_backtest(prices, float(p.get("monthly", 500)))
    r["source"] = src
    return r


@app.get("/calc/paper")
def paper():
    s = db.settings()
    trades = db.list("paper_trades", "ts")
    state = trading.paper_positions(trades, float(s.get("paper_starting_cash", 10000)))
    marks = {k: float(v) for k, v in ((k[5:], v) for k, v in s.items() if k.startswith("mark:"))}
    value = state["cash"]
    for t, pos in state["positions"].items():
        px = marks.get(t, pos["avg_cost"])
        pos["price"] = px
        pos["value"] = round(pos["qty"] * px, 2)
        pos["unrealized"] = round(pos["qty"] * (px - pos["avg_cost"]), 2)
        value += pos["value"]
    start = float(s.get("paper_starting_cash", 10000))
    state.update(total_value=round(value, 2), start=start, total_return=round(value / start - 1, 4), trades=trades)
    return state


def _check_paper_trade(row: dict):
    if row["side"] == "sell":
        st = trading.paper_positions(db.list("paper_trades"), float(db.settings().get("paper_starting_cash", 10000)))
        held = st["positions"].get(row["ticker"], {}).get("qty", 0)
        if float(row["qty"]) > held + 1e-9:
            raise HTTPException(400, f"You only hold {held} of {row['ticker']} — no short-selling in paper mode.")
    else:
        st = trading.paper_positions(db.list("paper_trades"), float(db.settings().get("paper_starting_cash", 10000)))
        cost = float(row["qty"]) * float(row["price"]) + float(row.get("fee", 1) or 0)
        if cost > st["cash"] + 1e-9:
            raise HTTPException(400, f"Not enough fake cash: need {cost:,.2f}, have {st['cash']:,.2f}.")


@app.post("/calc/refresh-prices")
def refresh_prices():
    """Fetch latest prices for holdings with a ticker, and paper-trade tickers, and EUR→INR FX."""
    msgs = []
    try:
        import httpx
        fx = httpx.get("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=INR", timeout=10,
                       follow_redirects=True).json()["rates"]["INR"]
        db.set_setting("fx_inr_per_eur", fx)
        msgs.append(f"EUR→INR {fx} (ECB)")
    except Exception as e:  # noqa: BLE001
        msgs.append(f"FX not refreshed ({type(e).__name__})")
    try:
        import yfinance as yf
    except ImportError:
        return {"messages": msgs + ["yfinance not installed; prices not refreshed"]}
    today = date.today().isoformat()
    for h in db.list("holdings"):
        if h["ticker"]:
            try:
                px = float(yf.Ticker(h["ticker"]).history(period="5d")["Close"].dropna().iloc[-1])
                h.update(last_price=round(px, 4), price_date=today)
                db.upsert("holdings", h)
                msgs.append(f"{h['ticker']} {px:,.2f}")
            except Exception:  # noqa: BLE001
                msgs.append(f"{h['ticker']}: no price")
    for t in {tr["ticker"] for tr in db.list("paper_trades")}:
        try:
            px = float(yf.Ticker(t).history(period="5d")["Close"].dropna().iloc[-1])
            db.set_setting(f"mark:{t}", round(px, 4))
        except Exception:  # noqa: BLE001
            pass
    return {"messages": msgs}


@app.get("/calc/quote/{ticker}")
def quote(ticker: str):
    try:
        import yfinance as yf
        px = float(yf.Ticker(ticker).history(period="5d")["Close"].dropna().iloc[-1])
        return {"ticker": ticker, "price": round(px, 4)}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"No quote for {ticker} ({type(e).__name__}). Enter the price by hand.")


# ---------------- documents ----------------
import base64 as _b64  # noqa: E402
import subprocess as _sp  # noqa: E402

_review_cache: dict = {}
EXTRACT_TYPES = {"de_payslip", "in_tds_statement", "in_gera_invoice"}


@app.get("/docs/meta")
def docs_meta():
    root = _root()
    folders = sorted({r["folder"] for r in docs.library(root)} | {"_Inbox"})
    s = db.settings()
    on = _drive_on()
    return {"categories": docs.CATEGORIES, "folders": folders, "root": str(root),
            "source": "gdrive" if on else "local",
            "source_label": f"Google Drive · {s.get('gdrive_folder_name') or 'folder'}" if on else str(root),
            "last_sync": s.get("gdrive_last_sync") if on else None}


@app.post("/docs/analyze")
def docs_analyze(p: dict = Body(...)):
    name = Path(p.get("filename") or "document").name
    try:
        data = _b64.b64decode(p["data"].split(",")[-1])
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "Couldn't read the uploaded file.")
    if len(data) > 60 * 1024 * 1024:
        raise HTTPException(400, "File is larger than 60 MB.")
    a = docs.analyze(_root(), data, name)
    if a["confidence"] < 0.6 and a["has_text"]:
        try:
            client = _client()
        except ImportError:
            client = None
        if client:
            text, _ = docs.extract_text(data, name)
            ai = docs.ai_classify(client, "claude-haiku-4-5-20251001", text, name)
            if ai:
                a.update(ai)
                a.update(docs.plan(_root(), text, name, ai, a["fields"]))
    dup = next((d for d in db.list("documents") if d["sha256"] == a["sha256"]), None)
    a["duplicate_of"] = dup["stored_path"] if dup else None
    _inbox().mkdir(parents=True, exist_ok=True)
    (_inbox() / (a["sha256"] + Path(name).suffix.lower())).write_bytes(data)
    return a


@app.post("/docs/file")
def docs_file(p: dict = Body(...)):
    sha, name = p["sha256"], Path(p["filename"]).name
    src = next(_inbox().glob(sha + ".*"), None)
    if not src:
        raise HTTPException(400, "Upload expired — please add the file again.")
    try:
        root = _root()
        tgt = docs.file_bytes(root, src.read_bytes(), p["folder"], name)
    except ValueError as e:
        raise HTTPException(400, str(e))
    src.unlink(missing_ok=True)
    rel = tgt.relative_to(root).as_posix()
    drive_note = None
    if _drive_on():
        try:
            gdrive.push_new_file(_drive(), _gcache(), rel)
            drive_note = "uploaded"
        except gdrive.DriveError as e:
            drive_note = f"Saved in the app, but not uploaded to Drive: {e}"
    f = p.get("fields") or {}
    row = {"sha256": sha, "original_name": p.get("original_name") or name, "stored_path": rel, "doc_type": p.get("doc_type"),
           "category": p.get("category"), "country": p.get("country"), "doc_date": (f.get("dates") or [None])[0],
           "amount": f.get("amount"), "currency": f.get("currency"), "fields": json.dumps(f, ensure_ascii=False),
           "text_excerpt": (p.get("excerpt") or "")[:600], "confidence": p.get("confidence"), "status": "filed",
           "added": datetime.now().isoformat(timespec="seconds")}
    existing = next((d for d in db.list("documents") if d["sha256"] == sha), None)
    if existing:
        row["id"] = existing["id"]
    doc_id = db.upsert("documents", row)
    ran = False
    if p.get("doc_type") in EXTRACT_TYPES:
        try:
            ran = _extract_facts()
        except Exception:  # noqa: BLE001
            pass
    _review_cache.clear()
    return {"id": doc_id, "path": rel, "facts_refreshed": ran, "drive": drive_note}


def _extract_facts() -> bool:
    """Re-run the deterministic extractors over the current document root -> facts/*.json."""
    r = _sp.run([sys.executable, str(TOOLS_DIR / "planner.py"), "extract", str(_root())],
                timeout=300, capture_output=True)
    return r.returncode == 0


@app.get("/docs/library")
def docs_library():
    meta = {d["stored_path"]: d for d in db.list("documents")}
    out = []
    for r in docs.library(_root()):
        m = meta.get(r["path"])
        if m:
            r.update(category=m["category"], doc_type=m["doc_type"], doc_date=m["doc_date"], amount=m["amount"], currency=m["currency"], logged=True)
        else:
            r.update(category=_category_for(r["folder"], r["name"]), doc_type=None, logged=False)
        out.append(r)
    return out


def _category_for(folder: str, name: str) -> str:
    """Category for files the app didn't file itself: your folder layout first, then the file name."""
    f = folder.lower()
    if "home_gera" in f:
        return "Tax — India" if "4_tds" in f else "Property — Gera flat"
    for key, cat in (("/bank", "Bank statements"), ("epfo", "Social security & pension"), ("carrier", "Career"),
                     ("investments", "Investments"), ("insurance", "Insurance"), ("receipts", "Receipts & bills"),
                     ("india/tax", "Tax — India"), ("germany/tax", "Tax — Germany")):
        if key in f:
            return cat
    c = docs.classify("", name)
    return c["category"] if c["confidence"] else "Other"


@app.get("/docs/review")
def docs_review():
    """Read every document in the planner and list the ones that look misfiled."""
    out, root = [], _root()
    lib = docs.library(root)
    for r in lib:
        pth = root / r["path"]
        key = (r["path"], r["modified"], r["size"])
        a = _review_cache.get(key)
        if a is None:
            a = docs.analyze(root, pth.read_bytes(), r["name"])
            a.pop("excerpt", None)
            _review_cache[key] = a
        if a["confidence"] >= 0.8 and not docs.same_place(r["folder"], a["folder"]):
            out.append({"path": r["path"], "current_folder": r["folder"], "label": a["label"], "category": a["category"],
                        "suggested_folder": a["folder"], "suggested_name": a["filename"], "confidence": a["confidence"]})
    return {"checked": len(lib), "suggestions": out}


@app.post("/docs/move")
def docs_move(p: dict = Body(...)):
    root = _root()
    new_rel = (Path(p["folder"].strip("/")) / Path(p["filename"]).name).as_posix()
    if _drive_on():  # move in Drive first; if that fails, leave everything where it is
        if (root / new_rel).exists():
            raise HTTPException(400, "A file with that name already exists in the target folder.")
        try:
            gdrive.push_move(_drive(), _gcache(), p["path"], new_rel)
        except gdrive.DriveError as e:
            raise HTTPException(400, str(e))
    try:
        tgt = docs.move_existing(root, p["path"], p["folder"], Path(p["filename"]).name)
    except ValueError as e:
        raise HTTPException(400, str(e))
    rel = tgt.relative_to(root).as_posix()
    with db.conn() as c:
        c.execute("UPDATE documents SET stored_path=? WHERE stored_path=?", (rel, p["path"]))
    _review_cache.clear()
    return {"path": rel}


@app.get("/docs/open")
def docs_open(path: str):
    root = _root()
    tgt = (root / path).resolve()
    if root.resolve() not in tgt.parents or not tgt.is_file():
        raise HTTPException(404)
    return FileResponse(tgt)


# ---------------- Ask Claude ----------------
toolbox = assistant.Toolbox(db, PLANNER_ROOT, lambda: _holding_items())
toolbox.root_fn = _root


def _client():
    key = db.settings().get("anthropic_api_key") or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    import anthropic
    return anthropic.Anthropic(api_key=key)


def _provider(s: dict | None = None) -> str:
    """Which AI the user chose. Old installs with only an API key keep using it."""
    s = s or db.settings()
    p = s.get("ai_provider")
    if p in ai_cli.PROVIDERS:
        return p
    return "api" if (s.get("anthropic_api_key") or os.environ.get("ANTHROPIC_API_KEY")) else "none"


def _ai_ready(s: dict | None = None) -> bool:
    s = s or db.settings()
    p = _provider(s)
    if p == "api":
        return bool(s.get("anthropic_api_key") or os.environ.get("ANTHROPIC_API_KEY"))
    if p in ai_cli.CLI:
        return bool(ai_cli.which(p))
    return False


@app.get("/chat/meta")
def chat_meta():
    s = db.settings()
    p = _provider(s)
    return {"key_set": bool(s.get("anthropic_api_key") or os.environ.get("ANTHROPIC_API_KEY")),
            "provider": p, "provider_label": ai_cli.PROVIDERS[p], "ready": _ai_ready(s),
            "providers": ai_cli.PROVIDERS, "cli": ai_cli.status(),
            "user_name": _profile()["name"],
            "model": s.get("claude_model", assistant.DEFAULT_MODEL), "models": assistant.MODELS}


@app.get("/ai/status")
def ai_status():
    return chat_meta()


@app.post("/ai/provider")
def ai_provider(p: dict = Body(...)):
    prov = p.get("provider")
    if prov not in ai_cli.PROVIDERS:
        raise HTTPException(400, "Unknown AI provider.")
    db.set_setting("ai_provider", prov)
    return chat_meta()


@app.get("/chat/list")
def chat_list():
    return db.chat_list()


@app.get("/chat/{chat_id}")
def chat_get(chat_id: int):
    return {"id": chat_id, "messages": assistant.display_messages(db.chat_history(chat_id))}


@app.delete("/chat/{chat_id}")
def chat_del(chat_id: int):
    db.chat_delete(chat_id)
    return {"ok": True}


@app.post("/chat/send")
def chat_send(p: dict = Body(...)):
    text = (p.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "empty message")
    s = db.settings()
    prov = _provider(s)
    if prov == "none":
        raise HTTPException(400, "Choose an AI assistant in Settings → AI assistant first (or keep using the app without one).")
    client = None
    if prov == "api":
        try:
            client = _client()
        except ImportError:
            raise HTTPException(400, "The 'anthropic' package isn't installed — run install.bat.")
        if client is None:
            raise HTTPException(400, "Add your Anthropic API key in Settings → AI assistant first.")
    elif not ai_cli.which(prov):
        raise HTTPException(400, f"The {ai_cli.CLI[prov]} command isn't installed. Install it with: {ai_cli.INSTALL[prov]}")
    chat_id = p.get("chat_id")
    if not chat_id:
        chat_id = db.chat_create(text[:60] + ("…" if len(text) > 60 else ""))
    history = db.chat_history(chat_id)
    umsg = {"role": "user", "content": text}
    history.append(umsg)
    db.chat_append(chat_id, umsg)
    system = assistant.system_prompt(_profile())
    prof_id = _profile()["id"]
    the_db = _db_for(_profile())  # stay on this user's data even if someone switches mid-answer

    def gen():
        yield assistant._sse("chat", {"id": chat_id})
        if prov == "api":
            yield from assistant.chat_stream(client, s.get("claude_model", assistant.DEFAULT_MODEL), history, toolbox,
                                             web_search=s.get("claude_web_search", "1") == "1",
                                             on_message=lambda m: the_db.chat_append(chat_id, m), system=system)
            return
        yield assistant._sse("tool", {"name": "snapshot", "label": "Reading your numbers"})
        snap = toolbox.run("get_financial_snapshot", {})
        dl = toolbox.run("list_deadlines", {})
        prompt = ai_cli.build_prompt(system, snap, dl, history[:-1], text, tools=True)
        tok = _new_session(prof_id, chat_id, write=True)
        out = []
        try:
            for kind, val in ai_cli.stream(prov, prompt, tools={"url": _self_url(), "token": tok}, poll=lambda: _drain(tok)):
                if kind == "text":
                    out.append(val)
                    yield assistant._sse("text", {"t": val})
                elif kind == "error":
                    yield assistant._sse("error", {"message": val})
                    return
                elif kind in ("tool", "tool_done", "proposal"):
                    yield assistant._sse(kind, val)
        finally:
            props = _sessions.pop(tok, {}).get("proposals", [])
        if out or props:
            note = "".join(out)
            if props:  # pending suggestions aren't stored; record what was offered so the history makes sense
                note += "\n\n_Suggested changes (not applied unless you pressed Apply):_\n" + "\n".join(f"- {x['label']}" for x in props)
            the_db.chat_append(chat_id, {"role": "assistant", "content": [{"type": "text", "text": note}]})
        yield assistant._sse("done", {})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------------- Google Drive ----------------
_drive_client: dict = {}


def _drive() -> gdrive.Drive:
    s = db.settings()
    key = (s.get("gdrive_client_id"), s.get("gdrive_refresh_token"))
    if not all(key):
        raise gdrive.DriveError("Google Drive isn't connected.")
    if _drive_client.get("key") != key:
        _drive_client.update(key=key, d=gdrive.Drive(s["gdrive_client_id"], s.get("gdrive_client_secret", ""), s["gdrive_refresh_token"]))
    return _drive_client["d"]


def _redirect_uri() -> str:
    return f"http://127.0.0.1:{PORT}/"


@app.get("/gdrive/status")
def gdrive_status():
    s = db.settings()
    m = gdrive.load_manifest(_gcache())
    return {"client_set": bool(s.get("gdrive_client_id") and s.get("gdrive_client_secret")),
            "client_id_hint": ("…" + s["gdrive_client_id"][-28:]) if s.get("gdrive_client_id") else "",
            "connected": bool(s.get("gdrive_refresh_token")), "account": s.get("gdrive_account", ""),
            "folder_id": s.get("gdrive_folder_id", ""), "folder_name": s.get("gdrive_folder_name", ""),
            "active": _drive_on(), "last_sync": s.get("gdrive_last_sync"), "files": len(m.get("files", {})),
            "redirect_uri": _redirect_uri()}


@app.post("/gdrive/client")
def gdrive_client(p: dict = Body(...)):
    try:
        if p.get("json"):
            cid, sec = gdrive.parse_client_json(p["json"])
        else:
            cid, sec = (p.get("client_id") or "").strip(), (p.get("client_secret") or "").strip()
            if not cid.endswith(".apps.googleusercontent.com") or not sec:
                raise gdrive.DriveError("Enter the client ID (…apps.googleusercontent.com) and client secret.")
    except gdrive.DriveError as e:
        raise HTTPException(400, str(e))
    db.set_setting("gdrive_client_id", cid)
    db.set_setting("gdrive_client_secret", sec)
    return gdrive_status()


@app.get("/gdrive/connect")
def gdrive_connect():
    s = db.settings()
    if not (s.get("gdrive_client_id") and s.get("gdrive_client_secret")):
        raise HTTPException(400, "Add your Google OAuth client first.")
    state = gdrive.secrets.token_urlsafe(24)
    verifier, challenge = gdrive.pkce_pair()
    db.set_setting("gdrive_oauth_state", state)
    db.set_setting("gdrive_oauth_verifier", verifier)
    return RedirectResponse(gdrive.auth_url(s["gdrive_client_id"], _redirect_uri(), state, challenge))


def _gdrive_callback(params) -> str:
    """Google redirects to http://127.0.0.1:<port>/?code=…&state=…  Returns a message for the page."""
    s = db.settings()
    if params.get("error"):
        return "Google sign-in was cancelled."
    if not s.get("gdrive_oauth_state") or params.get("state") != s.get("gdrive_oauth_state"):
        return "Sign-in link expired — click Connect again."
    db.set_setting("gdrive_oauth_state", "")
    try:
        with gdrive.httpx.Client(timeout=30) as http:
            tok = gdrive.exchange_code(http, s["gdrive_client_id"], s["gdrive_client_secret"], params["code"],
                                       s.get("gdrive_oauth_verifier", ""), _redirect_uri())
        db.set_setting("gdrive_refresh_token", tok["refresh_token"])
        db.set_setting("gdrive_account", _drive().account())
    except gdrive.DriveError as e:
        return str(e)
    return "ok"


@app.post("/gdrive/folder")
def gdrive_folder(p: dict = Body(...)):
    try:
        fid = gdrive.parse_folder_id(p.get("folder", ""))
        meta = _drive().meta(fid)
    except gdrive.DriveError as e:
        raise HTTPException(400, str(e))
    if meta.get("mimeType") != gdrive.FOLDER or meta.get("trashed"):
        raise HTTPException(400, "That link points to a file, not a folder.")
    db.set_setting("gdrive_folder_id", fid)
    db.set_setting("gdrive_folder_name", meta.get("name", ""))
    return gdrive_status()


@app.post("/gdrive/sync")
def gdrive_sync():
    s = db.settings()
    if not s.get("gdrive_folder_id"):
        raise HTTPException(400, "Choose a Drive folder first.")
    try:
        stats = gdrive.sync(_drive(), s["gdrive_folder_id"], _gcache())
    except gdrive.DriveError as e:
        raise HTTPException(400, str(e))
    db.set_setting("doc_source", "gdrive")
    db.set_setting("gdrive_last_sync", datetime.now().isoformat(timespec="seconds"))
    stats["facts_refreshed"] = False
    if stats["downloaded"] or stats["removed"] or not (_gcache() / "facts").exists():
        try:
            stats["facts_refreshed"] = _extract_facts()
        except Exception:  # noqa: BLE001
            pass
    _review_cache.clear()
    return {**stats, **gdrive_status()}


@app.post("/gdrive/source")
def gdrive_source(p: dict = Body(...)):
    src = p.get("source")
    if src not in ("local", "gdrive"):
        raise HTTPException(400, "source must be 'local' or 'gdrive'")
    if src == "gdrive" and not gdrive.load_manifest(_gcache()).get("root"):
        raise HTTPException(400, "Sync Google Drive once first.")
    db.set_setting("doc_source", src)
    _review_cache.clear()
    return gdrive_status()


@app.post("/gdrive/disconnect")
def gdrive_disconnect():
    s = db.settings()
    if s.get("gdrive_refresh_token"):
        with gdrive.httpx.Client(timeout=15) as http:
            gdrive.revoke(http, s["gdrive_refresh_token"])
    for k in ("gdrive_refresh_token", "gdrive_account", "gdrive_last_sync"):
        db.set_setting(k, "")
    db.set_setting("doc_source", "local")
    _drive_client.clear()
    _review_cache.clear()
    return gdrive_status()


# ---------------- tool bridge for Claude Code / Gemini CLI (see mcp_server.py) ----------------
WRITE_TOOLS = {"save_goal", "add_account", "add_transaction", "add_expense", "update_deadline"}
_sessions: dict[str, dict] = {}
_proposals: dict[str, dict] = {}
SESSION_TTL = 900  # seconds a CLI run may keep using its token


def _self_url() -> str:
    return f"http://127.0.0.1:{PORT}"


def _new_session(pid: str, chat_id=None, write: bool = True) -> str:
    for t in [t for t, v in _sessions.items() if time.time() - v["created"] > SESSION_TTL]:
        _sessions.pop(t, None)
    tok = secrets.token_urlsafe(24)
    _sessions[tok] = {"pid": pid, "chat_id": chat_id, "write": write, "events": [], "proposals": [], "created": time.time()}
    return tok


def _drain(tok: str) -> list:
    s = _sessions.get(tok)
    if not s:
        return []
    ev, s["events"] = s["events"], []
    return ev


def _session(tok: str) -> dict:
    s = _sessions.get(tok or "")
    if not s or time.time() - s["created"] > SESSION_TTL:
        raise HTTPException(403, "This tool session has ended.")
    if PROFILES.active() is None or PROFILES.active()["id"] != s["pid"]:
        raise HTTPException(409, "The app switched to another user; this answer can no longer use their data.")
    return s


def _describe(name: str, a: dict) -> str:
    if name == "save_goal":
        return f"{'Update' if a.get('id') else 'Add'} goal “{a.get('name')}”: {a.get('target_today')} {a.get('currency', 'EUR')} by {a.get('target_date')}" + (f", saving {a['monthly']}/month" if a.get("monthly") else "")
    if name == "add_account":
        return f"{'Update' if a.get('id') else 'Add'} {a.get('kind', 'asset')} “{a.get('name')}”: {a.get('amount')} {a.get('currency')}"
    if name == "add_transaction":
        return f"Log {a.get('kind')} of {a.get('amount')} in account #{a.get('account_id')}" + (f" ({a['category']})" if a.get("category") else "") + (f", repeating {a['frequency']}" if a.get("frequency") else "")
    if name == "add_expense":
        return f"Add monthly spending “{a.get('category')}”: {a.get('amount')}"
    if name == "update_deadline":
        return f"Mark deadline #{a.get('id')} as {a.get('status')}"
    return name


@app.post("/mcp/tools")
def mcp_tools(p: dict = Body(...)):
    s = _session(p.get("token"))
    out = []
    for t in assistant.TOOLS:
        if t["name"] in WRITE_TOOLS and not s["write"]:
            continue
        desc = t["description"]
        if t["name"] in WRITE_TOOLS:
            desc += " Nothing changes until the user presses Apply in the app; tell them so."
        out.append({"name": t["name"], "description": desc, "inputSchema": t["input_schema"]})
    return {"tools": out}


@app.post("/mcp/call")
def mcp_call(p: dict = Body(...)):
    s = _session(p.get("token"))
    name, args = p.get("name"), p.get("arguments") or {}
    if name not in {t["name"] for t in assistant.TOOLS}:
        raise HTTPException(404, f"Unknown tool {name}")
    label = assistant.TOOL_LABELS.get(name, name)
    if name in WRITE_TOOLS:
        if not s["write"]:
            raise HTTPException(403, "This run is read-only.")
        pid = secrets.token_urlsafe(9)
        prop = {"id": pid, "name": name, "args": args, "label": _describe(name, args), "profile": s["pid"],
                "chat_id": s["chat_id"], "status": "pending"}
        _proposals[pid] = prop
        s["proposals"].append({k: prop[k] for k in ("id", "name", "args", "label", "status")})
        s["events"].append(("proposal", {k: prop[k] for k in ("id", "name", "label")}))
        return {"status": "suggested", "message": "Shown to the user with an Apply button. Nothing has changed yet."}
    s["events"].append(("tool", {"name": name, "label": label}))
    return {"result": toolbox.run(name, args)}


@app.post("/chat/apply")
def chat_apply(p: dict = Body(...)):
    prop = _proposals.get(p.get("id") or "")
    if not prop:
        raise HTTPException(404, "This suggestion has expired — ask again.")
    if prop["status"] != "pending":
        raise HTTPException(400, "Already applied.")
    if _profile()["id"] != prop["profile"]:
        raise HTTPException(409, "Switch back to the user this suggestion was made for.")
    res = toolbox.run(prop["name"], prop["args"])
    if isinstance(res, dict) and "error" in res:
        raise HTTPException(400, str(res["error"]))
    prop["status"] = "applied"
    if prop.get("chat_id"):
        db.chat_append(prop["chat_id"], {"role": "assistant", "content": [{"type": "text", "text": f"✓ Applied: {prop['label']}"}]})
    return {"ok": True, "label": prop["label"], "result": res}


# ---------------- analysis & recommendations ----------------
ANALYSIS_ASK = """Review this person's whole financial situation as a careful financial planner would, and write the app's
"Analysis & recommendations" report. Use the tools for fresh data and for any tax or savings figure. Be honest when data
is missing — missing data is itself a finding (say what to add and where). Plain English, specific numbers, no jargon
without a short explanation. Compare with the previous report if one is given.

Reply with ONE JSON object and nothing else:
{"headline": "one sentence, the most important thing right now",
 "summary": "2-3 sentences: where they stand",
 "changes": ["what changed since the previous report", "..."],
 "risks": [{"title": "...", "detail": "...", "severity": "high|medium|low"}],
 "gaps": ["data that is missing and where to add it in the app", "..."],
 "actions": [{"title": "short imperative", "why": "one sentence with the number that matters", "priority": 1,
              "due": "YYYY-MM-DD or null", "tab": "Position|Money|Plan|Goals|Invest|Tax|Documents"}]}
Rank actions most important first; at most 7."""
_analysis_running: set[str] = set()


def _parse_report(raw: str) -> dict | None:
    m = re.search(r"\{.*\}", raw or "", re.S)
    if not m:
        return None
    try:
        d = json.loads(m.group(0))
    except ValueError:
        return None
    return d if isinstance(d, dict) and d.get("headline") else None


def _run_analysis(pid: str, trigger: str) -> None:
    prof = PROFILES.get(pid)
    d = _db_for(prof)
    s = d.settings()
    prov = _provider(s)
    rid = d.upsert("reports", {"created": datetime.now().isoformat(timespec="seconds"), "provider": prov,
                               "trigger": trigger, "status": "running"})
    raw, err = "", None
    try:
        prev = d.list("reports", "id DESC")
        prev = next((r for r in prev if r["status"] == "done"), None)
        prev_txt = f"\n\nPrevious report ({prev['created'][:10]}):\n{prev['data']}" if prev else "\n\nThis is the first report."
        system = assistant.system_prompt(prof)
        if prov in ai_cli.CLI:
            snap, dl = toolbox.run("get_financial_snapshot", {}), toolbox.run("list_deadlines", {})
            prompt = ai_cli.build_prompt(system, snap, dl, [], ANALYSIS_ASK + prev_txt, tools=True)
            tok = _new_session(pid, None, write=False)
            try:
                for kind, val in ai_cli.stream(prov, prompt, tools={"url": _self_url(), "token": tok}, poll=lambda: _drain(tok)):
                    if kind == "text":
                        raw += val
                    elif kind == "error":
                        err = val
            finally:
                _sessions.pop(tok, None)
        elif prov == "api":
            client = _client()
            if client is None:
                raise RuntimeError("No Anthropic API key saved.")
            msgs = [{"role": "user", "content": ANALYSIS_ASK + prev_txt}]
            tools = [t for t in assistant.TOOLS if t["name"] not in WRITE_TOOLS]
            for _ in range(8):
                r = client.messages.create(model=s.get("claude_model", assistant.DEFAULT_MODEL), max_tokens=4096,
                                           system=system, messages=msgs, tools=tools)
                msgs.append({"role": "assistant", "content": [b.model_dump(exclude_none=True) for b in r.content]})
                raw = "".join(getattr(b, "text", "") for b in r.content if b.type == "text") or raw
                if r.stop_reason != "tool_use":
                    break
                msgs.append({"role": "user", "content": [
                    {"type": "tool_result", "tool_use_id": b.id,
                     "content": json.dumps(toolbox.run(b.name, b.input), ensure_ascii=False, default=str)[:60000]}
                    for b in r.content if b.type == "tool_use"]})
        else:
            err = "Choose an AI assistant in Settings → AI assistant to run an analysis."
    except Exception as e:  # noqa: BLE001
        err = f"Analysis failed: {e}"
    data = _parse_report(raw)
    if data:
        d.upsert("reports", {"id": rid, "created": datetime.now().isoformat(timespec="seconds"), "provider": prov,
                             "trigger": trigger, "status": "done", "headline": str(data.get("headline"))[:300],
                             "data": json.dumps(data, ensure_ascii=False), "raw": raw[:50000]})
    else:
        d.upsert("reports", {"id": rid, "created": datetime.now().isoformat(timespec="seconds"), "provider": prov,
                             "trigger": trigger, "status": "failed",
                             "headline": (err or "The assistant's reply wasn't a readable report.")[:300], "raw": raw[:50000]})
    _analysis_running.discard(pid)


def _start_analysis(trigger: str) -> bool:
    pid = _profile()["id"]
    if pid in _analysis_running:
        return False
    _analysis_running.add(pid)
    threading.Thread(target=_run_analysis, args=(pid, trigger), daemon=True).start()
    return True


def _report_out(r: dict | None) -> dict | None:
    if not r:
        return None
    out = {k: r[k] for k in ("id", "created", "provider", "trigger", "status", "headline")}
    out["provider_label"] = ai_cli.PROVIDERS.get(r["provider"] or "none", "").split(" — ")[0]
    try:
        out["data"] = json.loads(r["data"]) if r.get("data") else None
    except ValueError:
        out["data"] = None
    return out


@app.post("/analysis/run")
def analysis_run():
    if not _ai_ready():
        raise HTTPException(400, "Choose an AI assistant in Settings → AI assistant first.")
    return {"started": _start_analysis("manual"), "running": True}


@app.get("/analysis")
def analysis_get(report_id: int | None = None):
    pid = _profile()["id"]
    s = db.settings()
    rows = db.list("reports", "id DESC")
    done = [r for r in rows if r["status"] in ("done", "failed")]
    auto = s.get("analysis_auto", "off")
    last_ok = next((r for r in rows if r["status"] == "done"), None)
    if (auto == "weekly" and pid not in _analysis_running and _ai_ready(s)
            and (not last_ok or (datetime.now() - datetime.fromisoformat(last_ok["created"])).days >= 7)
            and not (done and done[0]["status"] == "failed" and (datetime.now() - datetime.fromisoformat(done[0]["created"])).total_seconds() < 6 * 3600)):
        _start_analysis("weekly")
    pick = next((r for r in done if r["id"] == report_id), None) if report_id else (done[0] if done else None)
    return {"running": pid in _analysis_running, "auto": auto, "ready": _ai_ready(s),
            "report": _report_out(pick),
            "history": [{"id": r["id"], "created": r["created"], "status": r["status"], "headline": r["headline"]} for r in done[:24]]}


@app.post("/analysis/auto")
def analysis_auto(p: dict = Body(...)):
    v = p.get("auto")
    if v not in ("off", "weekly"):
        raise HTTPException(400, "auto must be 'off' or 'weekly'")
    db.set_setting("analysis_auto", v)
    return {"auto": v}


# ---------------- users & onboarding ----------------
def _public_profile(p: dict) -> dict:
    return {k: p.get(k) for k in ("id", "name", "countries", "currencies", "home_currency", "onboarded", "legacy", "created")}


@app.get("/profiles")
def profiles_list():
    reg = PROFILES.load()
    return {"active": reg.get("active"), "profiles": [_public_profile(p) for p in reg["profiles"]],
            "countries": profiles.COUNTRIES, "currency_of": profiles.CURRENCY_OF,
            "tax_supported": sorted(profiles.TAX_SUPPORTED)}


@app.post("/profiles")
def profiles_create(p: dict = Body(...)):
    try:
        new = PROFILES.create(p.get("name", ""))
    except ValueError as e:
        raise HTTPException(400, str(e))
    _review_cache.clear()
    return _public_profile(new)


@app.post("/profiles/{pid}/activate")
def profiles_activate(pid: str):
    try:
        prof = PROFILES.activate(pid)
    except ValueError as e:
        raise HTTPException(404, str(e))
    _review_cache.clear()
    return _public_profile(prof)


@app.post("/profiles/{pid}/rename")
def profiles_rename(pid: str, p: dict = Body(...)):
    name = (p.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Enter a name.")
    return _public_profile(PROFILES.update(pid, name=name[:40]))


@app.post("/onboarding")
def onboarding(p: dict = Body(...)):
    """Save the onboarding wizard for the active user in one go."""
    prof = _profile()
    countries = profiles.clean_countries(p.get("countries"))
    if not countries:
        raise HTTPException(400, "Pick at least one country.")
    currencies = profiles.clean_currencies(p.get("currencies")) or [profiles.CURRENCY_OF.get(countries[0], "EUR")]
    home = (p.get("home_currency") or currencies[0]).upper()
    if home not in currencies:
        currencies.insert(0, home)
    d = _db_for(prof)
    today = date.today().isoformat()

    def num(v, label="A value"):
        if v is None or not str(v).strip():
            return None
        try:
            return float(str(v).replace(",", "").replace(" ", ""))
        except ValueError:
            raise HTTPException(400, f"{label}: '{v}' isn't a number.")

    # check every number first, so a typo saves nothing
    num(p.get("monthly_income"), "Take-home pay")
    num(p.get("monthly_spending"), "Monthly spending")
    num(p.get("fx_inr_per_eur"), "Exchange rate")
    for a in p.get("accounts") or []:
        num(a.get("balance"), f"Balance of {a.get('name') or 'an account'}")
    for k in ("target", "saved", "monthly"):
        num((p.get("goal") or {}).get(k), "Goal")

    income = num(p.get("monthly_income"))
    if income is not None:
        d.set_setting("monthly_income_eur", income)  # the Plan tab reads this key; currency = home currency
    if num(p.get("fx_inr_per_eur")):
        d.set_setting("fx_inr_per_eur", num(p.get("fx_inr_per_eur")))
    spend = num(p.get("monthly_spending"))
    if spend:
        if not any(e["category"] == "Everyday spending (estimate)" for e in d.list("expenses")):
            d.upsert("expenses", {"category": "Everyday spending (estimate)", "amount": spend,
                                  "note": "From onboarding — replace with real categories in Plan when you can."})
    for a in p.get("accounts") or []:
        name = (a.get("name") or "").strip()
        if not name:
            continue
        ccy = (a.get("currency") or home).upper()
        country = a.get("country") if a.get("country") in profiles.COUNTRIES else countries[0]
        d.upsert("accounts", {"name": name[:60], "institution": (a.get("institution") or "")[:60], "country": country,
                              "currency": ccy, "type": a.get("type") or "Current account",
                              "opening_balance": num(a.get("balance")) or 0, "opening_date": today,
                              "liquid": 1, "in_networth": 1, "archived": 0, "note": "Added during onboarding"})
        if ccy not in currencies:
            currencies.append(ccy)
    g = p.get("goal") or {}
    if (g.get("name") or "").strip() and num(g.get("target")):
        d.upsert("goals", {"name": g["name"].strip()[:80], "target_today": num(g["target"]),
                           "currency": (g.get("currency") or home).upper(), "target_date": g.get("date") or f"{date.today().year + 3}-12-31",
                           "saved": num(g.get("saved")) or 0, "monthly": num(g.get("monthly")) or 0,
                           "annual_return": 0.05, "inflation": 0.02, "priority": 1, "note": "Added during onboarding"})
    if not prof.get("legacy"):
        d.seed_calendar([e for e in compliance.GENERIC_SEED if e["country"] in countries])
    if p.get("ai_provider") in ai_cli.PROVIDERS:
        d.set_setting("ai_provider", p["ai_provider"])
    upd = {"countries": countries, "currencies": currencies, "home_currency": home, "onboarded": True}
    if (p.get("name") or "").strip():
        upd["name"] = p["name"].strip()[:40]
    return _public_profile(PROFILES.update(prof["id"], **upd))


# ---------------- frontend ----------------
@app.middleware("http")
async def _no_stale_frontend(request: Request, call_next):
    """Make the browser re-check the page and its scripts on every load, so an app update
    never runs new HTML with an old cached app.js."""
    resp = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static/"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")


@app.get("/")
def index(request: Request):
    q = request.query_params
    if "state" in q and ("code" in q or "error" in q):  # coming back from Google sign-in
        msg = _gdrive_callback(q)
        qs = "gdrive=connected" if msg == "ok" else "gdrive=error&msg=" + _urlquote(msg)
        return RedirectResponse(f"/?{qs}#settings")
    return FileResponse(HERE / "static" / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=PORT)
