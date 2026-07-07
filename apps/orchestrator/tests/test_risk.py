from orchestrator.application.risk import decide, size_fixed_fractional
from orchestrator.domain.strategy import RiskLimits, Signal


def test_sizing_percent_risk_then_capped() -> None:
    limits = RiskLimits(risk_pct=0.01, stop_distance_pct=0.02, max_position_notional=1000.0)
    # 100k equity: 0.01*100000/0.02 = 50000, capped at 1000
    assert size_fixed_fractional(100_000, limits) == 1000.0
    # small equity, uncapped: 0.01*1000/0.02 = 500
    assert size_fixed_fractional(1_000, limits) == 500.0


def test_sizing_guards() -> None:
    limits = RiskLimits()
    assert size_fixed_fractional(0, limits) == 0.0
    assert size_fixed_fractional(-5, limits) == 0.0


_BUY = Signal(action="buy", strength=0.8, reason="up")
_SELL = Signal(action="sell", strength=0.8, reason="down")


def test_non_buy_signal_holds() -> None:
    d = decide(_SELL, "BTC/USD", 100_000, 0.0, RiskLimits())
    assert d.action == "hold"
    assert d.notional is None


def test_buy_produces_sized_decimal_string() -> None:
    d = decide(_BUY, "BTC/USD", 100_000, 0.0, RiskLimits(max_position_notional=1000.0))
    assert d.action == "buy"
    assert d.notional == "1000.00"  # money is a decimal string, not a float


def test_headroom_exhausted_holds() -> None:
    limits = RiskLimits(max_position_notional=1000.0)
    d = decide(_BUY, "BTC/USD", 100_000, current_exposure=995.0, limits=limits)
    # headroom 5 < min_order_notional 10 → hold
    assert d.action == "hold"


def test_below_floor_holds() -> None:
    limits = RiskLimits(risk_pct=0.0001, stop_distance_pct=0.02, min_order_notional=10.0)
    # 0.0001*1000/0.02 = 5 < 10 floor
    d = decide(_BUY, "BTC/USD", 1_000, 0.0, limits)
    assert d.action == "hold"
