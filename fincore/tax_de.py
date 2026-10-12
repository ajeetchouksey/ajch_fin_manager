"""German income tax (Einkommensteuer) per §32a EStG, plus Soli and church tax.

Plain English: Germany taxes your *taxable income* (zvE = gross pay minus
allowances and deductions) on a smooth curve. Nothing below the basic
allowance (Grundfreibetrag), then the rate rises gradually from 14% to 42%,
and 45% for very high incomes. Married couples filing jointly use
"splitting": tax = 2 x tax(half of combined income), which saves money when
the two incomes are unequal.

Numbers are the published §32a formulas. Rounded to whole euros like the
Finanzamt does. This is an ESTIMATE tool, not a substitute for ELSTER.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, asdict

# year -> (grundfreibetrag, zone2_end, a2, zone3_end, a3, c3, c4, zone4_end, c5)
TARIFF = {
    2023: (10908, 15999, 979.18, 62809, 192.59, 966.53, 9972.98, 277825, 18307.73),
    2024: (11784, 17005, 954.80, 66760, 181.19, 991.21, 10636.31, 277825, 18971.06),
    2025: (12096, 17443, 932.30, 68480, 176.64, 1015.13, 10911.92, 277825, 19246.67),
    2026: (12348, 17799, 914.51, 69878, 173.10, 1034.87, 11135.63, 277825, 19470.38),
}
# Soli is only charged once your income tax exceeds this (single; doubled for joint)
SOLI_FREIGRENZE = {2023: 17543, 2024: 18130, 2025: 19950, 2026: 20350}
# Sparer-Pauschbetrag: tax-free investment income per person
SPARER_PAUSCHBETRAG = 1000
CHURCH_RATE_HESSEN = 0.09  # Frankfurt is in Hessen (Bavaria/BW use 8%)


def income_tax_single(zve: float, year: int = 2026) -> int:
    """§32a basic tariff for one person."""
    if year not in TARIFF:
        raise ValueError(f"tariff for {year} not loaded; have {sorted(TARIFF)}")
    gfb, z2, a2, z3, a3, c3, c4, z4, c5 = TARIFF[year]
    x = math.floor(max(zve, 0))
    if x <= gfb:
        tax = 0.0
    elif x <= z2:
        y = (x - gfb) / 10000
        tax = (a2 * y + 1400) * y
    elif x <= z3:
        z = (x - z2) / 10000
        tax = (a3 * z + 2397) * z + c3
    elif x <= z4:
        tax = 0.42 * x - c4
    else:
        tax = 0.45 * x - c5
    return math.floor(tax)


def income_tax(zve: float, year: int = 2026, joint: bool = False) -> int:
    if joint:
        return 2 * income_tax_single(zve / 2, year)
    return income_tax_single(zve, year)


def soli(est: float, year: int = 2026, joint: bool = False) -> float:
    free = SOLI_FREIGRENZE[year] * (2 if joint else 1)
    if est <= free:
        return 0.0
    # "Milderungszone": phases in at 11.9% of the excess, capped at 5.5% of tax
    return round(min(0.055 * est, 0.119 * (est - free)), 2)


@dataclass
class DETaxResult:
    year: int
    zve: float
    joint: bool
    income_tax: int
    soli: float
    church_tax: float
    total: float
    average_rate: float
    marginal_rate: float
    explanation: str


def calculate(zve: float, year: int = 2026, joint: bool = False, church: bool = False,
              church_rate: float = CHURCH_RATE_HESSEN) -> dict:
    est = income_tax(zve, year, joint)
    s = soli(est, year, joint)
    k = round(est * church_rate, 2) if church else 0.0
    total = round(est + s + k, 2)
    # marginal: what the next 100 EUR of income costs
    nxt = income_tax(zve + 100, year, joint)
    marginal = (nxt - est) / 100
    avg = total / zve if zve > 0 else 0.0
    gfb = TARIFF[year][0] * (2 if joint else 1)
    expl = (
        f"On taxable income of €{zve:,.0f} you pay about €{total:,.0f} in total "
        f"({avg:.1%} of it on average). The first €{gfb:,.0f} is tax-free"
        f"{' (doubled because you file jointly)' if joint else ''}. "
        f"Each extra €100 you earn costs about €{marginal*100:,.0f} in income tax "
        f"(your 'marginal rate' {marginal:.0%}) — which is also roughly what each "
        f"€100 of deductible expenses (Werbungskosten, Riester, donations) saves you."
    )
    return asdict(DETaxResult(year, zve, joint, est, s, k, total, round(avg, 4), round(marginal, 4), expl))


def capital_gains_tax(gains: float, joint: bool = False, church: bool = False,
                      equity_etf: bool = False) -> dict:
    """Abgeltungsteuer on investment income: flat 25% + 5.5% Soli (+church).
    Equity ETFs/funds get 30% 'Teilfreistellung' (only 70% is taxed)."""
    allowance = SPARER_PAUSCHBETRAG * (2 if joint else 1)
    taxable_base = gains * (0.7 if equity_etf else 1.0)
    taxable = max(taxable_base - allowance, 0)
    if church:
        # church tax is deductible inside the flat tax -> effective rate 24.45% (9%)
        rate = 0.25 / (1 + 0.25 * CHURCH_RATE_HESSEN)
        abg = taxable * rate
        kist = abg * CHURCH_RATE_HESSEN
    else:
        abg, kist = taxable * 0.25, 0.0
    sol = abg * 0.055
    total = round(abg + sol + kist, 2)
    return {
        "gains": gains, "taxable": round(taxable, 2), "abgeltungsteuer": round(abg, 2),
        "soli": round(sol, 2), "church_tax": round(kist, 2), "total": total,
        "explanation": (
            f"Investment income is taxed at a flat ~26.4% in Germany. The first "
            f"€{allowance:,} per year is tax-free (Sparer-Pauschbetrag) — give your bank a "
            f"Freistellungsauftrag so it isn't withheld. "
            + ("Equity ETFs only have 70% of gains taxed. " if equity_etf else "")
            + f"Here: €{taxable:,.0f} taxable → about €{total:,.0f} tax."
        ),
    }
