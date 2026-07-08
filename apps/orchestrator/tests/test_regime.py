from orchestrator.application.regime import (
    RegimeSeries,
    ratio_regime,
    regime_filtered,
    zscore_regime,
)
from orchestrator.domain.strategy import Bar, Signal


def _bar(date: str, close: float = 100.0) -> Bar:
    return Bar(ts=f"{date}T05:00:00Z", open=close, high=close, low=close, close=close, volume=1.0)


def _always_buy(_bars: object) -> Signal:
    return Signal(action="buy", strength=1.0, reason="test")


def test_regime_uses_latest_observation_strictly_before_date() -> None:
    # yesterday's close decides today's action: on the observation's own date it must NOT apply
    series = RegimeSeries([("2024-01-02", False), ("2024-01-03", True)])
    assert series.at("2024-01-02") is True  # no observation before → risk-on default
    assert series.at("2024-01-03") is False  # sees the 01-02 flag, not its own date's
    assert series.at("2024-01-04") is True


def test_regime_forward_fills_gaps() -> None:
    series = RegimeSeries([("2024-01-02", False)])
    assert series.at("2024-02-15") is False  # weeks later, still the last known flag


def test_regime_defaults_risk_on_before_any_data() -> None:
    assert RegimeSeries([]).at("2024-01-02") is True


def test_ratio_regime_contango_is_risk_on() -> None:
    vix3m = [("2024-01-02", 18.0), ("2024-01-03", 15.0), ("2024-01-04", 20.0)]
    vix = [("2024-01-02", 15.0), ("2024-01-03", 18.0)]  # 01-04 missing → dropped
    regime = ratio_regime(vix3m, vix, threshold=1.0)
    assert regime.at("2024-01-03") is True  # 01-02: 18/15 > 1 → contango, risk-on
    assert regime.at("2024-01-04") is False  # 01-03: 15/18 < 1 → backwardation, risk-off


def test_zscore_regime_flags_spike_after_warm_window() -> None:
    calm = [(f"2024-01-{d:02d}", 3.0 + 0.01 * (d % 2)) for d in range(1, 11)]
    spike = [("2024-02-01", 6.0)]
    regime = zscore_regime(calm + spike, window=10, threshold=1.0)
    assert regime.at("2024-01-31") is True  # calm history → risk-on
    assert regime.at("2024-02-02") is False  # spike z >> 1 → risk-off


def test_zscore_regime_unwarm_prefix_is_risk_on() -> None:
    series = [(f"2024-01-{d:02d}", 100.0 * d) for d in range(1, 6)]  # wildly trending but short
    regime = zscore_regime(series, window=120, threshold=1.0)
    assert all(regime.at(f"2024-01-{d:02d}") for d in range(2, 7))


def test_regime_filtered_forces_sell_when_risk_off() -> None:
    regime = RegimeSeries([("2024-01-02", False)])
    wrapped = regime_filtered(_always_buy, regime)
    assert wrapped([_bar("2024-01-03")]).action == "sell"


def test_regime_filtered_delegates_when_risk_on() -> None:
    regime = RegimeSeries([("2024-01-02", True)])
    wrapped = regime_filtered(_always_buy, regime)
    assert wrapped([_bar("2024-01-03")]).action == "buy"
