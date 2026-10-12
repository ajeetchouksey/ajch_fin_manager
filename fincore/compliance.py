"""Tax & compliance calendar — Germany + India, seeded from your planner folder.

Each entry has a stable `key`, so re-seeding never duplicates an item or
resets something you've marked done. Dates verified 30-Sep-2026; rules change,
so each item says what it's based on.
"""
from __future__ import annotations

import json
from pathlib import Path

SEED = [
    # ---------------- INDIA: Gera flat TDS (from 4_TDS/TDS_Tracker.md) ----------------
    {"key": "in-gera-s07-interest", "due": "2026-10-30", "country": "IN", "severity": "critical",
     "title": "Pay interest + late fee on Stage 07 TDS (~₹7,874)",
     "detail": "Stage 07 (12th slab) TDS was deposited 301 days late (ack AM32642923) with ₹0 interest and ₹0 fee. "
               "The department will raise a demand: ~₹844 interest + ₹7,030 late fee (₹200/day, capped at the TDS). "
               "Paying before 30 Oct 2026 keeps you inside the one-year window, which avoids a separate ₹10,000–₹1,00,000 penalty. "
               "HOW: TRACES → Defaults / Request for correction, or pay via challan (minor head 400) against the demand.",
     "source": "Finance/india/home_Gera_ioj/4_TDS/TDS_Tracker.md"},
    {"key": "in-gera-s08-correction", "due": "2026-10-31", "country": "IN", "severity": "high",
     "title": "Correct Stage 08 Form 26QB on TRACES (3 wrong fields)",
     "detail": "Ack AM32695283: amount paid ₹7,03,800 → should be ₹7,03,008; previous instalments ₹69,71,030 → ₹70,30,080; "
               "interest/fee look swapped (₹7,030/₹492 → ~₹422/₹7,030). File an online 26QB correction on TRACES (login as taxpayer, PAN).",
     "source": "TDS_Tracker.md"},
    {"key": "in-gera-s10-ack", "due": "2026-10-15", "country": "IN", "severity": "high",
     "title": "Download Stage 10 challan statement & record its acknowledgement no.",
     "detail": "Only the bank advice is on file for CIN 26091100093305ICIC. Download the statement from the e-filing portal, save as "
               "4_TDS/10_25thSlab_<ACK>_Statement.pdf and fill the tracker row.",
     "source": "TDS_Tracker.md"},
    {"key": "in-gera-s06-credit", "due": "2026-10-31", "country": "IN", "severity": "normal",
     "title": "Send Gera the 26-Nov-2024 challan (₹6,440 not credited in their SOA)",
     "detail": "Challan AL17308863 is on the tax portal but not on Gera's statement of account. Email kaustubh.mahajan@gera.in "
               "with the challan and Form 16B so their books match. Also note the ₹590 shortfall on that stage (already offset by your ₹2,221 credit).",
     "source": "Finance/india/home_Gera_ioj/README.md"},
    {"key": "in-gera-multibuyer", "due": "2026-11-30", "country": "IN", "severity": "high",
     "title": "Ask a CA about 'More than one buyer = Yes' on all 26QBs",
     "detail": "Five 26QB filings say there is more than one buyer; Form 141 (stage 09) says one buyer at 100%. If there is a co-owner, "
               "the department expects their own 26QB for their share; if not, the earlier forms need correcting. Resolve before it shows as a mismatch.",
     "source": "TDS_Tracker.md"},
    {"key": "in-gera-dg-charges", "due": "2026-11-30", "country": "IN", "severity": "normal",
     "title": "Ask Gera what 'Admin Charges DG Backup' ₹2,61,994.91 is",
     "detail": "It appears on the SOA but not the original cost sheet. Ask what it covers, when it's due, and whether TDS applies.",
     "source": "Finance/india/home_Gera_ioj/README.md"},
    {"key": "in-gera-recurring", "due": None, "country": "IN", "severity": "normal",
     "title": "For every future Gera stage (11–17): file Form 141 within 30 days of month-end",
     "detail": "1% of the stage's consideration EXCLUDING GST (₹7,030 per 5% stage), using the registered Fifth Schedule figure, "
               "not the cash you transfer. Then download Form 16B and send it to Gera within 15 days. ₹49,211 of TDS still to come.",
     "source": "TDS_Tracker.md"},
    {"key": "in-itr-ay2627", "due": "2026-12-31", "country": "IN", "severity": "high",
     "title": "Indian ITR for FY 2025-26: last date for a belated/revised return",
     "detail": "Original due date was 31 Jul 2026. As an NRI you must file if Indian income (NRO/FD interest, rent, capital gains) "
               "exceeds ₹4 lakh, or to claim back excess TDS your bank deducted (often 30%+ on NRO interest). Late fee ₹1,000–₹5,000. "
               "If already filed, mark done.",
     "source": "Income-tax Dept. due dates"},
    {"key": "in-residential-status", "due": None, "country": "IN", "severity": "normal",
     "title": "Confirm your Indian residential status each year (NRI vs resident)",
     "detail": "Rule of thumb: fewer than 182 days in India in the year (and not 120+ days with Indian income > ₹15 lakh) → NRI. "
               "As NRI: only Indian income is taxed in India; NRE interest is tax-free in India; convert savings accounts to NRO/NRE (FEMA rule).",
     "source": "Income-tax Act 2025 / FEMA"},
    # ---------------- GERMANY ----------------
    {"key": "de-taxclass-check", "due": "2026-10-15", "country": "DE", "severity": "high",
     "title": "Check whether your German returns are mandatory (tax class III/V?)",
     "detail": "Your folder has a 2022 'Antrag auf Steuerklassenwechsel'. If you and your spouse use class III/V, filing is MANDATORY every year: "
               "2025 return was due 31 Jul 2026 (1 Mar 2027 if a Steuerberater/Lohnsteuerhilfeverein files it); earlier years are overdue — "
               "file them now, before the Finanzamt estimates (schätzt) your tax. If both are class IV, filing is voluntary and you have 4 years.",
     "source": "§149 AO, §46 EStG"},
    {"key": "de-2022-voluntary", "due": "2026-12-31", "country": "DE", "severity": "high",
     "title": "Last day for a voluntary 2022 German return",
     "detail": "Voluntary returns (Antragsveranlagung) may be filed up to 4 years later. For 2022 that ends 31 Dec 2026. Employees usually get a refund "
               "(~€1,000 average) from Werbungskosten: commute (2022: €0.30/km, €0.35 from km 21), home-office €5/day up to €600, work equipment, job-application costs. "
               "Only relevant if 2022 wasn't a mandatory year.",
     "source": "§46 EStG, §169 AO"},
    {"key": "de-2023-return", "due": "2027-12-31", "country": "DE", "severity": "normal",
     "title": "German 2023 return (Lohnsteuerbescheinigung 2023 is in your folder)",
     "detail": "Voluntary deadline 31 Dec 2027; if mandatory (III/V) it's already overdue. The app's Germany calculator estimates the refund once you enter zvE.",
     "source": "Finance/germany/Lohnsteuerbescheinigung 2023 12 Dezember.pdf"},
    {"key": "de-2025-advisor", "due": "2027-03-01", "country": "DE", "severity": "normal",
     "title": "2025 return — deadline if filed via Steuerberater/Lohnsteuerhilfe",
     "detail": "Mandatory filers without an advisor were due 31 Jul 2026.", "source": "§149 AO"},
    {"key": "de-foreign-income", "due": None, "country": "DE", "severity": "high",
     "title": "Declare Indian income in every German return (Anlage KAP / AUS / V)",
     "detail": "As a German tax resident you're taxed in Germany on WORLDWIDE income. Indian FD/NRO/NRE interest → Anlage KAP (NRE interest is tax-free "
               "in India but NOT in Germany). Indian tax already paid is credited up to the DTAA limit (10% on interest). Rent from an Indian flat "
               "(later) → Anlage V/AUS; it's exempt in Germany but raises your rate (Progressionsvorbehalt). Not declaring = tax evasion risk.",
     "source": "India–Germany DTAA (1995), §34c EStG"},
    {"key": "de-freistellung", "due": "2027-01-15", "country": "DE", "severity": "normal",
     "title": "Check Freistellungsaufträge across German banks/brokers (€2,000 joint)",
     "detail": "The Sparer-Pauschbetrag (€1,000 single / €2,000 joint) is only applied automatically if you've split it across your banks. "
               "Also January: 'Vorabpauschale' tax on accumulating ETFs is debited — keep some cash in the broker account.",
     "source": "§20(9) EStG"},
    {"key": "de-gera-home-note", "due": None, "country": "DE", "severity": "normal",
     "title": "Indian flat: no German deduction; future sale/rent rules",
     "detail": "Buying a home abroad gives no German deduction. If you later rent it out, rent is taxable in India and reported in Germany "
               "(progression). Get advice before you sell or rent it — both countries have reporting rules.",
     "source": "DTAA Art. 6/13, §23 EStG"},
]


def load_facts(planner_root: Path) -> dict:
    out = {}
    fdir = planner_root / "facts"
    if fdir.exists():
        for f in fdir.glob("*.json"):
            try:
                out[f.stem] = json.loads(f.read_text(encoding="utf-8"))
            except Exception:  # noqa: BLE001
                out[f.stem] = []
    return out


# Registered Fifth Schedule stages (02 was billed together with 03). Paid dates from TDS_Tracker.md.
GERA_STAGES = [
    {"no": "01", "name": "Agreement signing", "paid": "2023-09"},
    {"no": "02", "name": "Bundled with excavation", "paid": "2024-02"},
    {"no": "03", "name": "Excavation", "paid": "2024-02"},
    {"no": "04", "name": "Foundation", "paid": "2024-03"},
    {"no": "05", "name": "Retaining wall", "paid": "2024-03"},
    {"no": "06", "name": "4th slab", "paid": "2024-10"},
    {"no": "07", "name": "12th slab", "paid": "2025-09"},
    {"no": "08", "name": "20th slab", "paid": "2026-03"},
    {"no": "09", "name": "Blockwork", "paid": "2026-08"},
    {"no": "10", "name": "25th slab", "paid": "2026-08"},
] + [{"no": f"{n:02d}", "name": f"Stage {n}", "paid": None} for n in range(11, 18)]


# Cumulative consideration paid (excl. GST). Early dates/amounts from Gera receipts in
# 3_Milestones/01_Signing and 03_Excavation; stage totals from the TDS tracker
# (previous-instalment figures). Stage 10's exact day isn't on file — tracker says Aug-26.
GERA_PAYMENTS = [
    ("2023-08-11", 49000, "Booking"), ("2023-09-20", 149000, "Signing"),
    ("2023-09-26", 1555016, "Signing"), ("2024-02-08", 2555016, "Excavation"),
    ("2024-02-10", 2812032, "Excavation"), ("2024-03-18", 5624064, "Foundation + retaining wall"),
    ("2024-10-28", 6327072, "4th slab"), ("2025-09-29", 7030080, "12th slab"),
    ("2026-03-10", 7733088, "20th slab"), ("2026-08-12", 8436096, "Blockwork"),
    ("2026-08-25", 9139104, "25th slab"),
]


def gera_projection(start: str = "2026-10-31", end: str = "2027-12-31", stages: int = 7,
                    per_stage: int = 703008, paid: int = 9139104) -> list[dict]:
    """Evenly spaced estimate for the remaining stages up to contractual possession."""
    from datetime import date as _d
    a, b = _d.fromisoformat(start), _d.fromisoformat(end)
    out = []
    for i in range(1, stages + 1):
        t = a + (b - a) * (i - 1) / max(stages - 1, 1)
        out.append({"date": t.isoformat(), "cumulative": paid + per_stage * i, "label": f"Stage {10 + i} (estimate)"})
    return out


def gera_summary(facts: dict) -> dict:
    """Numbers from the registered agreement + TDS tracker (verified 14-Sep-2026)."""
    consideration = 14060163
    invoiced = 9139104  # stages 01-10
    return {
        "unit": "Gera Island of Joy 1A-806, Wagholi, Pune",
        "consideration": consideration, "paid_consideration": invoiced,
        "paid_pct": round(invoiced / consideration, 4),
        "remaining_consideration": 4921056,  # 7 stages x ₹7,03,008 (Fifth Schedule)
        "remaining_with_gst": round(4921056 * 1.05),
        "tds_deposited": 93612, "tds_due_so_far": 91391, "tds_credit": 2221,
        "tds_still_to_come": 49211, "possession_contractual": "2027-12-31",
        "stages": GERA_STAGES,
        "payments": [{"date": d, "cumulative": c, "label": l} for d, c, l in GERA_PAYMENTS],
        "projection": gera_projection(),
        "challans_in_facts": len(facts.get("gera_tds", [])),
        "invoices_in_facts": len(facts.get("gera_invoices", [])),
    }


def payslip_summary(facts: dict) -> dict:
    ps = [p for p in facts.get("germany_payslips", []) if p.get("period_net_eur")]
    ps.sort(key=lambda p: p["period"])
    latest = ps[-1] if ps else None
    return {"count": len(ps), "latest_period": latest and latest["period"],
            "latest_net_eur": latest and latest["period_net_eur"],
            "series": [{"period": p["period"], "net": p["period_net_eur"]} for p in ps]}


# ---------------- generic calendar for new users (no personal data) ----------------
def _next(month: int, day: int) -> str:
    from datetime import date as _d
    t = _d.today()
    d = _d(t.year, month, day)
    return (d if d >= t else _d(t.year + 1, month, day)).isoformat()


GENERIC_SEED = [
    {"key": "gen-de-return", "due": _next(7, 31), "country": "DE", "severity": "high",
     "title": "German tax return for last year (if you must file or want a refund)",
     "detail": "Employees must file if, for example, they have tax class III/V or IV with factor, income not taxed at source "
               "(rent, foreign income over €410) or certain benefits. Deadline 31 July; later (end of February the year after next) "
               "if a Steuerberater or Lohnsteuerhilfeverein files for you. Voluntary returns can be filed up to 4 years back.",
     "source": "§149 AO, §46 EStG"},
    {"key": "gen-de-freistellung", "due": _next(1, 15), "country": "DE", "severity": "normal",
     "title": "Check Freistellungsaufträge at your banks and brokers",
     "detail": "Up to €1,000 a year (€2,000 for couples filing jointly) of interest, dividends and gains is tax-free. "
               "Split it across your banks so nothing is withheld unnecessarily.",
     "source": "§20 (9) EStG"},
    {"key": "gen-de-foreign", "due": None, "country": "DE", "severity": "normal",
     "title": "Declare foreign income in your German return",
     "detail": "Germany taxes residents on worldwide income. Foreign interest, rent and gains go on Anlage KAP / V / AUS; "
               "tax already paid abroad is usually credited under the tax treaty.",
     "source": "§34c EStG"},
    {"key": "gen-in-itr", "due": _next(7, 31), "country": "IN", "severity": "high",
     "title": "Indian income-tax return (ITR) if you have Indian income",
     "detail": "Due 31 July for individuals without an audit. NRIs file if Indian-source income (interest, rent, gains) "
               "is above the basic exemption or to claim a refund of TDS.",
     "source": "Income-tax Act"},
    {"key": "gen-in-advance", "due": _next(3, 15), "country": "IN", "severity": "normal",
     "title": "Indian advance tax (last instalment 15 March)",
     "detail": "If tax due after TDS is ₹10,000 or more in a year, pay advance tax in instalments (15 Jun, 15 Sep, 15 Dec, 15 Mar) "
               "to avoid interest.",
     "source": "Income-tax Act"},
    {"key": "gen-in-status", "due": None, "country": "IN", "severity": "normal",
     "title": "Confirm your Indian residential status each year",
     "detail": "Whether you are resident or NRI depends mainly on days spent in India; it decides what India taxes "
               "and which rebates you get.",
     "source": "Income-tax Act"},
]
