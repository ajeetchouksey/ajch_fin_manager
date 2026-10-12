import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fincore import planning, tax_de, tax_in, trading  # noqa: E402


def test_de_zero_below_allowance():
    assert tax_de.income_tax(12348, 2026) == 0
    assert tax_de.income_tax(12096, 2025) == 0


def test_de_zones_continuous():
    for y, (gfb, z2, a2, z3, a3, c3, c4, z4, c5) in tax_de.TARIFF.items():
        for edge in (z2, z3, z4):
            assert abs(tax_de.income_tax(edge + 1, y) - tax_de.income_tax(edge, y)) <= 2, (y, edge)


def test_de_splitting_saves_money():
    assert tax_de.income_tax(100000, 2026, joint=True) < tax_de.income_tax(100000, 2026)


def test_de_top_rate():
    assert tax_de.income_tax(300000, 2026) == int(0.45 * 300000 - 19470.38)


def test_soli_free_below_threshold():
    assert tax_de.soli(20000, 2026) == 0
    assert tax_de.soli(40000, 2026, joint=True) == 0
    assert tax_de.soli(50000, 2026) == round(0.055 * 50000, 2)


def test_in_new_regime_resident_rebate():
    r = tax_in.regime_tax(salary=1275000, regime="new", resident=True)
    assert r["total"] == 0  # 12.75L - 75k std = 12L -> rebate


def test_in_nri_no_rebate():
    r = tax_in.regime_tax(other_income=800000, regime="new", resident=False)
    # 4-8L @5% = 20,000 + 4% cess
    assert r["total"] == 20800


def test_in_old_regime_with_deductions():
    r = tax_in.regime_tax(salary=1500000, regime="old", ded_80c=150000, ded_80d=25000, home_loan_interest=200000)
    # 15L-50k-1.5L-25k-2L = 10.75L -> 12.5k + 1L + 22.5k = 1,35,000 *1.04
    assert r["taxable_normal_income"] == 1075000
    assert r["total"] == round(135000 * 1.04)


def test_in_ltcg_exemption():
    r = tax_in.regime_tax(ltcg_equity=225000, regime="new", resident=False)
    assert r["capital_gains_tax"] == 12500


def test_required_monthly_hits_target():
    m = planning.required_monthly(100000, 10000, 0.06, 120)
    assert abs(planning.future_value(10000, m, 0.06, 120) - 100000) < 1


def test_goal_plan_status():
    g = planning.plan_goal("x", 10000, date(2030, 1, 1), 10000, 0, 0.0, 0.0, today=date(2026, 1, 1))
    assert g["status"] == "on_track"


def test_backtest_buy_hold_matches_price():
    p = trading.synthetic_prices(5)
    r = trading.backtest(p, "buy_hold", 10000, cost_pct=0)
    assert abs(r["metrics"]["final"] - 10000 * p.iloc[-1] / p.iloc[0]) < 1
    for s in trading.STRATEGIES:
        trading.backtest(p, s)


def test_paper_positions():
    trades = [{"ts": "1", "ticker": "A", "side": "buy", "qty": 10, "price": 100, "fee": 1},
              {"ts": "2", "ticker": "A", "side": "sell", "qty": 5, "price": 120, "fee": 1}]
    st = trading.paper_positions(trades, 10000)
    assert st["cash"] == 10000 - 1001 + 599
    assert st["positions"]["A"]["qty"] == 5
    assert st["realized_pnl"] == round(5 * (120 - 100.1) - 1, 2)
