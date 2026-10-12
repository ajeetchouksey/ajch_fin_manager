"""Users on this laptop: each one has separate data.

data/profiles.json lists the users and which one is active:
  {"active": "ajeet", "profiles": [{"id", "name", "db", "docs_root", "countries", "currencies",
                                    "home_currency", "onboarded", "legacy", "created"}]}

- The first time the app starts with an existing data/finance.db, that data becomes the first
  user's profile *in place* (nothing is moved or copied) and keeps the planner folder as its
  documents folder. It is marked "legacy" so Gera/TDS seeds keep applying to it only.
- A new user gets data/users/<id>/ with its own finance.db, documents/, inbox/ and
  gdrive_cache/. They go through onboarding before using the app.
"""
from __future__ import annotations

import getpass
import json
import re
import threading
from datetime import datetime
from pathlib import Path

COUNTRIES = {"DE": "Germany", "IN": "India", "AT": "Austria", "CH": "Switzerland", "NL": "Netherlands",
             "FR": "France", "GB": "United Kingdom", "US": "United States", "AE": "United Arab Emirates",
             "SG": "Singapore", "OTHER": "Other"}
CURRENCY_OF = {"DE": "EUR", "AT": "EUR", "NL": "EUR", "FR": "EUR", "IN": "INR", "CH": "CHF", "GB": "GBP",
               "US": "USD", "AE": "AED", "SG": "SGD"}
# Countries the app has tax rules and calendars for today.
TAX_SUPPORTED = {"DE", "IN"}

_lock = threading.Lock()


class Profiles:
    def __init__(self, data_dir: Path, legacy_db: Path, legacy_docs: Path):
        self.data_dir, self.legacy_db, self.legacy_docs = data_dir, legacy_db, legacy_docs
        self.file = data_dir / "profiles.json"

    # storage
    def load(self) -> dict:
        with _lock:
            if self.file.exists():
                try:
                    return json.loads(self.file.read_text(encoding="utf-8"))
                except ValueError:
                    pass
            reg = {"active": None, "profiles": []}
            if self.legacy_db.exists():  # existing install: today's data becomes the first user
                reg["profiles"].append(self._legacy_profile())
                reg["active"] = reg["profiles"][0]["id"]
            self._save(reg)
            return reg

    def _save(self, reg: dict) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        tmp = self.file.with_suffix(".tmp")
        tmp.write_text(json.dumps(reg, indent=1, ensure_ascii=False), encoding="utf-8")
        tmp.replace(self.file)

    def save(self, reg: dict) -> None:
        with _lock:
            self._save(reg)

    def _legacy_profile(self) -> dict:
        return {"id": _slug(_guess_name()), "name": _guess_name(), "db": str(self.legacy_db),
                "docs_root": str(self.legacy_docs), "countries": ["DE", "IN"], "currencies": ["EUR", "INR"],
                "home_currency": "EUR", "onboarded": True, "legacy": True,
                "created": datetime.now().isoformat(timespec="seconds")}

    # queries
    def all(self) -> list[dict]:
        return self.load()["profiles"]

    def get(self, pid: str | None) -> dict | None:
        return next((p for p in self.all() if p["id"] == pid), None)

    def active(self) -> dict | None:
        reg = self.load()
        return next((p for p in reg["profiles"] if p["id"] == reg.get("active")), None)

    # changes
    def create(self, name: str) -> dict:
        name = (name or "").strip()
        if not name:
            raise ValueError("Enter a name.")
        reg = self.load()
        base, pid, n = _slug(name), _slug(name), 2
        while any(p["id"] == pid for p in reg["profiles"]):
            pid, n = f"{base}-{n}", n + 1
        home = self.data_dir / "users" / pid
        (home / "documents").mkdir(parents=True, exist_ok=True)
        p = {"id": pid, "name": name[:40], "db": str(home / "finance.db"), "docs_root": str(home / "documents"),
             "countries": [], "currencies": [], "home_currency": "EUR", "onboarded": False, "legacy": False,
             "created": datetime.now().isoformat(timespec="seconds")}
        reg["profiles"].append(p)
        reg["active"] = pid
        self.save(reg)
        return p

    def activate(self, pid: str) -> dict:
        reg = self.load()
        p = next((x for x in reg["profiles"] if x["id"] == pid), None)
        if not p:
            raise ValueError("No such user.")
        reg["active"] = pid
        self.save(reg)
        return p

    def update(self, pid: str, **fields) -> dict:
        reg = self.load()
        p = next((x for x in reg["profiles"] if x["id"] == pid), None)
        if not p:
            raise ValueError("No such user.")
        allowed = {"name", "countries", "currencies", "home_currency", "onboarded", "docs_root"}
        for k, v in fields.items():
            if k in allowed and v is not None:
                p[k] = v
        self.save(reg)
        return p


def _guess_name() -> str:
    try:
        user = getpass.getuser()
    except Exception:  # noqa: BLE001
        user = ""
    first = re.split(r"[._\-\s]+", user)[0] if user else ""
    return first.capitalize() if first.isalpha() else "Me"


def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:24] or "user"


def clean_countries(codes) -> list[str]:
    return [c for c in dict.fromkeys(codes or []) if c in COUNTRIES]


def clean_currencies(codes) -> list[str]:
    return [c.upper() for c in dict.fromkeys(codes or []) if re.fullmatch(r"[A-Za-z]{3}", c or "")]
