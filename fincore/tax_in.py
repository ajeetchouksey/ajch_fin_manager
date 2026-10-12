"""Indian income tax — new vs old regime, resident vs NRI.

Plain English:
- India has two menus. The NEW regime has lower rates but almost no
  deductions. The OLD regime has higher rates but lets you subtract things
  like 80C investments (PPF, ELSS, principal on a home loan), 80D health
  insurance and home-loan interest (s.24b). Pick whichever gives lower tax.
- If you live in Germany you are most likely a Non-Resident (NRI) for
  Indian tax. Then India only taxes income *earned in India* — e.g. NRO
  interest, rent, Indian capital gains. Your German salary is NOT taxed in
  India. NRIs do not get the s.87A rebate, so the "zero tax up to ₹12 lakh"
  headline does NOT apply to you.
- From 1 April 2026 the Income-tax Act 2025 replaces the 1961 Act. It
  renames "assessment year" to "tax year" and renumbers sections, but slabs
  for 2026-27 are unchanged from 2025-26.
"""
from __future__ import annotations

NEW_SLABS = [(400000, 0.0), (800000, 0.05), (1200000, 0.10), (1600000, 0.15),
             (2000000, 0.20), (2400000, 0.25), (float("inf"), 0.30)]
OLD_SLABS = [(250000, 0.0), (500000, 0.05), (1000000, 0.20), (float("inf"), 0.30)]
STD_DEDUCTION = {"new": 75000, "old": 50000}
REBATE = {"new": (1200000, 60000), "old": (500000, 12500)}  # (income limit, max rebate)
CESS = 0.04
CAP_80C, CAP_80D_SELF, CAP_24B = 150000, 25000, 200000
# Capital gains on listed equity / equity MFs (from 23 Jul 2024)
STCG_EQUITY, LTCG_EQUITY, LTCG_EXEMPT = 0.20, 0.125, 125000


def _slab_tax(income: float, slabs) -> float:
    tax, lower = 0.0, 0.0
    for upper, rate in slabs:
        if income > lower:
            tax += (min(income, upper) - lower) * rate
        lower = upper
    return tax


def _surcharge_rate(total_income: float, regime: str) -> float:
    if total_income <= 5_000_000:
        return 0.0
    if total_income <= 10_000_000:
        return 0.10
    if total_income <= 20_000_000:
        return 0.15
    if total_income <= 50_000_000 or regime == "new":
        return 0.25
    return 0.37


def regime_tax(salary: float = 0, other_income: float = 0, regime: str = "new",
               resident: bool = True, ded_80c: float = 0, ded_80d: float = 0,
               home_loan_interest: float = 0, other_deductions: float = 0,
               stcg_equity: float = 0, ltcg_equity: float = 0) -> dict:
    std = STD_DEDUCTION[regime] if salary > 0 else 0
    deductions = 0.0
    if regime == "old":
        deductions = (min(ded_80c, CAP_80C) + min(ded_80d, CAP_80D_SELF)
                      + min(home_loan_interest, CAP_24B) + other_deductions)
    normal_income = max(salary - std, 0) + other_income - deductions
    normal_income = max(normal_income, 0)
    slabs = NEW_SLABS if regime == "new" else OLD_SLABS
    base = _slab_tax(normal_income, slabs)
    cg = stcg_equity * STCG_EQUITY + max(ltcg_equity - LTCG_EXEMPT, 0) * LTCG_EQUITY
    total_income = normal_income + stcg_equity + ltcg_equity
    rebate = 0.0
    limit, cap = REBATE[regime]
    if resident and normal_income <= limit:
        rebate = min(base, cap)  # special-rate capital gains don't get the rebate
    tax = base - rebate + cg
    sur = tax * _surcharge_rate(total_income, regime)
    cess = (tax + sur) * CESS
    return {
        "regime": regime, "resident": resident, "standard_deduction": std,
        "deductions": round(deductions), "taxable_normal_income": round(normal_income),
        "slab_tax": round(base), "rebate_87a": round(rebate), "capital_gains_tax": round(cg),
        "surcharge": round(sur), "cess": round(cess), "total": round(tax + sur + cess),
    }


def compare(**kw) -> dict:
    new = regime_tax(regime="new", **kw)
    old = regime_tax(regime="old", **kw)
    better = "new" if new["total"] <= old["total"] else "old"
    saving = abs(new["total"] - old["total"])
    resident = kw.get("resident", True)
    expl = (
        f"New regime: ₹{new['total']:,} · Old regime: ₹{old['total']:,}. "
        f"The {better.upper()} regime saves you ₹{saving:,}. "
    )
    if not resident:
        expl += ("As an NRI you don't get the s.87A rebate, and only your Indian-source "
                 "income belongs here — not your German salary. ")
    if better == "new":
        expl += "Your deductions aren't big enough to beat the new regime's lower rates."
    else:
        expl += "Your deductions (80C/80D/home-loan interest) outweigh the new regime's lower rates."
    return {"new": new, "old": old, "better": better, "saving": saving, "explanation": expl}


def tds_on_property(consideration: float, stamp_value: float = 0) -> dict:
    """Buyer must deduct 1% TDS when the flat costs ≥ ₹50 lakh (s.194-IA /
    s.393 of the 2025 Act). Computed on consideration EXCLUDING GST.
    NOTE: if the SELLER were an NRI the rate would be 20%+ — not the case for Gera."""
    base = max(consideration, stamp_value)
    return {"base": base, "tds": round(base * 0.01) if base >= 5_000_000 else 0}
