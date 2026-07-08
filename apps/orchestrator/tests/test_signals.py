from orchestrator.application.signals import (
    STRATEGIES,
    bollinger_reversion,
    donchian_breakout,
    mean_reversion,
    momentum,
    sma_crossover,
    volume_momentum,
)
from orchestrator.domain.strategy import Bar


def _bars(closes: list[float]) -> list[Bar]:
    return [
        Bar(ts=f"t{i}", open=c, high=c, low=c, close=c, volume=1.0)
        for i, c in enumerate(closes)
    ]


def _ohlcv(rows: list[tuple[float, float, float, float]]) -> list[Bar]:
    """rows of (high, low, close, volume) — open tracks close (unused by these signals)."""
    return [
        Bar(ts=f"t{i}", open=c, high=h, low=lo, close=c, volume=v)
        for i, (h, lo, c, v) in enumerate(rows)
    ]


def test_sma_crossover_needs_enough_bars() -> None:
    sig = sma_crossover(_bars([1.0] * 5), fast=3, slow=10)
    assert sig.action == "hold"
    assert "need" in sig.reason


def test_sma_crossover_uptrend_buys() -> None:
    # rising series → fast MA above slow MA
    sig = sma_crossover(_bars([float(i) for i in range(1, 41)]), fast=5, slow=20)
    assert sig.action == "buy"
    assert sig.strength > 0


def test_sma_crossover_downtrend_sells() -> None:
    sig = sma_crossover(_bars([float(i) for i in range(40, 0, -1)]), fast=5, slow=20)
    assert sig.action == "sell"


def test_momentum_positive_and_negative() -> None:
    up = momentum(_bars([float(i) for i in range(1, 30)]), lookback=10)
    assert up.action == "buy"
    down = momentum(_bars([float(i) for i in range(30, 1, -1)]), lookback=10)
    assert down.action == "sell"


def test_mean_reversion_buys_below_ma() -> None:
    # last close well below the recent average → buy
    bars = _bars([float(i) for i in range(30, 0, -1)])  # falling: last is lowest
    sig = mean_reversion(bars, period=20)
    assert sig.action == "buy"


def test_donchian_breakout_buys_on_new_high() -> None:
    # 30 flat bars in a tight range, then a close that pierces above the prior high → buy
    rows = [(10.0, 9.0, 9.5, 1.0)] * 30 + [(12.0, 11.0, 11.5, 1.0)]
    sig = donchian_breakout(_ohlcv(rows), entry=20, exit_=10)
    assert sig.action == "buy"
    assert sig.strength > 0


def test_donchian_breakout_sells_on_new_low() -> None:
    rows = [(10.0, 9.0, 9.5, 1.0)] * 30 + [(8.0, 7.0, 7.5, 1.0)]
    sig = donchian_breakout(_ohlcv(rows), entry=20, exit_=10)
    assert sig.action == "sell"


def test_donchian_holds_inside_channel() -> None:
    rows = [(10.0, 9.0, 9.5, 1.0)] * 31
    assert donchian_breakout(_ohlcv(rows), entry=20, exit_=10).action == "hold"


def test_donchian_needs_enough_bars() -> None:
    assert donchian_breakout(_bars([1.0] * 5), entry=20, exit_=10).action == "hold"


def test_bollinger_reversion_buys_when_oversold() -> None:
    # noisy but mean-stable series, then a sharp drop far below the band → buy
    closes = [100.0 + (1.0 if i % 2 else -1.0) for i in range(25)] + [90.0]
    sig = bollinger_reversion(_bars(closes), period=20, k=2.0)
    assert sig.action == "buy"


def test_bollinger_reversion_sells_above_mean() -> None:
    closes = [100.0 + (1.0 if i % 2 else -1.0) for i in range(25)] + [110.0]
    sig = bollinger_reversion(_bars(closes), period=20, k=2.0)
    assert sig.action == "sell"


def test_bollinger_holds_with_no_dispersion() -> None:
    assert bollinger_reversion(_bars([100.0] * 25), period=20).action == "hold"


def test_volume_momentum_requires_volume_confirmation() -> None:
    # Rising price. Same trend, but only the high-volume last bar confirms the buy.
    base = [(float(i), float(i), float(i), 1.0) for i in range(1, 26)]
    thin = base + [(26.0, 26.0, 26.0, 1.0)]  # volume == average → no confirmation
    loud = base + [(26.0, 26.0, 26.0, 5.0)]  # volume spike → confirmed
    assert volume_momentum(_ohlcv(thin), lookback=10, vol_window=20).action == "hold"
    assert volume_momentum(_ohlcv(loud), lookback=10, vol_window=20).action == "buy"


def test_volume_momentum_sells_on_negative_return() -> None:
    rows = [(float(i), float(i), float(i), 1.0) for i in range(26, 0, -1)]
    assert volume_momentum(_ohlcv(rows), lookback=10, vol_window=20).action == "sell"


def test_registry_exposes_strategies() -> None:
    assert set(STRATEGIES) == {
        "sma_crossover", "momentum", "mean_reversion",
        "donchian_breakout", "bollinger_reversion", "volume_momentum",
    }
