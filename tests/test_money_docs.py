import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fincore import docs, ledger  # noqa: E402
from fincore.db import DB  # noqa: E402


def make_db(tmp_path):
    db = DB(tmp_path / "t.db")
    eur = db.upsert("accounts", {"name": "Giro", "country": "DE", "currency": "EUR", "type": "Current account", "opening_balance": 1000, "liquid": 1, "in_networth": 1})
    inr = db.upsert("accounts", {"name": "NRE", "country": "IN", "currency": "INR", "type": "NRE account", "opening_balance": 0, "liquid": 1, "in_networth": 1})
    return db, eur, inr


def test_occurrences_month_end():
    ds = ledger.occurrences(date(2026, 1, 31), "monthly", date(2026, 4, 30))
    assert ds == [date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30)]
    assert len(ledger.occurrences(date(2026, 9, 1), "daily", date(2026, 9, 30))) == 30
    assert len(ledger.occurrences(date(2026, 1, 1), "quarterly", date(2026, 12, 31))) == 4


def test_balances_and_transfer(tmp_path):
    db, eur, inr = make_db(tmp_path)
    db.upsert("transactions", {"date": "2026-09-01", "account_id": eur, "kind": "income", "amount": 5000, "category": "Salary"})
    db.upsert("transactions", {"date": "2026-09-02", "account_id": eur, "kind": "expense", "amount": 1800, "category": "Rent / Warmmiete"})
    db.upsert("transactions", {"date": "2026-09-03", "account_id": eur, "kind": "transfer", "amount": 1000, "to_account_id": inr, "to_amount": 108000})
    b = {a["name"]: a["balance"] for a in ledger.balances(db)}
    assert b == {"Giro": 1000 + 5000 - 1800 - 1000, "NRE": 108000}


def test_recurring_idempotent(tmp_path):
    db, eur, _ = make_db(tmp_path)
    db.upsert("recurring", {"kind": "expense", "account_id": eur, "amount": 50, "category": "Subscriptions", "frequency": "monthly", "start_date": "2026-01-15", "active": 1})
    n1 = ledger.materialize_recurring(db, date(2026, 6, 20))
    n2 = ledger.materialize_recurring(db, date(2026, 6, 20))
    assert n1 == 6 and n2 == 0


def test_summary_currency(tmp_path):
    db, eur, inr = make_db(tmp_path)
    db.upsert("transactions", {"date": "2026-09-10", "account_id": eur, "kind": "expense", "amount": 100, "category": "Groceries"})
    db.upsert("transactions", {"date": "2026-09-11", "account_id": inr, "kind": "expense", "amount": 10000, "category": "Support to family (India)"})
    s = ledger.summary(db, "month", date(2026, 9, 15), "EUR", 100.0)
    assert s["expense"] == 200.0
    s2 = ledger.summary(db, "month", date(2026, 9, 15), "INR", 100.0)
    assert s2["expense"] == 20000.0


def test_classify_examples():
    assert docs.classify("Tax Invoice Gera Developments Invoice No. 3110053022", "x.pdf")["doc_type"] == "in_gera_invoice"
    assert docs.classify("A br e c h n u ng d e r B ru t to /N et to - B e zü g e für Mai 2023", "scan.pdf")["doc_type"] == "de_payslip"
    assert docs.classify("", "Brutto-Netto-Abrechnung 2024 01.pdf")["matched_on"] == "file name only"
    assert docs.classify("hello world", "holiday.jpg")["doc_type"] == "unknown"


def test_fields_amounts():
    f = docs.fields("Transaction Amount(Rs.) 703008.0 Date 2026-08-12", "r.pdf")
    assert f["amount"] == 703008.0 and f["currency"] == "INR" and f["dates"][0] == "2026-08-12"
    assert docs._to_float("1.234.567,89") == 1234567.89 and docs._to_float("1,23,456.78") == 123456.78


def test_safe_target_blocks_escape(tmp_path):
    import pytest
    with pytest.raises(ValueError):
        docs.safe_target(tmp_path, "../../etc", "x.pdf")
