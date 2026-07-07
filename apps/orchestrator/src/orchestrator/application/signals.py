"""Signal tier — pure strategy functions `list[Bar] -> Signal`. Simple, well-understood
placeholders; the framework (pluggable, testable, journalled) is the point. Insufficient data is
expressed as a hold with a reason, never an exception."""

from __future__ import annotations

from collections.abc import Callable, Sequence

from orchestrator.domain.strategy import Bar, Signal

Strategy = Callable[[Sequence[Bar]], Signal]


def _sma(values: Sequence[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def sma_crossover(bars: Sequence[Bar], fast: int = 10, slow: int = 30) -> Signal:
    """Long when the fast SMA is above the slow SMA, flat/short-signal when below."""
    closes = [b.close for b in bars]
    fast_ma = _sma(closes, fast)
    slow_ma = _sma(closes, slow)
    if fast_ma is None or slow_ma is None:
        return Signal(action="hold", strength=0.0, reason=f"need >= {slow} bars, have {len(bars)}")
    spread = (fast_ma - slow_ma) / slow_ma
    strength = min(1.0, abs(spread) * 20)
    if spread > 0:
        return Signal(action="buy", strength=strength, reason=f"fast>slow ({spread:.4f})")
    if spread < 0:
        return Signal(action="sell", strength=strength, reason=f"fast<slow ({spread:.4f})")
    return Signal(action="hold", strength=0.0, reason="fast==slow")


def momentum(bars: Sequence[Bar], lookback: int = 20) -> Signal:
    """Long on positive lookback return, sell-signal on negative."""
    closes = [b.close for b in bars]
    if len(closes) <= lookback:
        return Signal(
            action="hold", strength=0.0, reason=f"need > {lookback} bars, have {len(bars)}"
        )
    ret = (closes[-1] - closes[-1 - lookback]) / closes[-1 - lookback]
    strength = min(1.0, abs(ret) * 10)
    if ret > 0:
        return Signal(action="buy", strength=strength, reason=f"+{ret:.4f} momentum")
    if ret < 0:
        return Signal(action="sell", strength=strength, reason=f"{ret:.4f} momentum")
    return Signal(action="hold", strength=0.0, reason="flat")


def mean_reversion(bars: Sequence[Bar], period: int = 20, threshold: float = 0.0) -> Signal:
    """Buy when price sits below its moving average (oversold → expect reversion up)."""
    closes = [b.close for b in bars]
    ma = _sma(closes, period)
    if ma is None:
        return Signal(
            action="hold", strength=0.0, reason=f"need >= {period} bars, have {len(bars)}"
        )
    dev = (closes[-1] - ma) / ma
    strength = min(1.0, abs(dev) * 20)
    if dev < -threshold:
        return Signal(action="buy", strength=strength, reason=f"below MA ({dev:.4f})")
    if dev > threshold:
        return Signal(action="sell", strength=strength, reason=f"above MA ({dev:.4f})")
    return Signal(action="hold", strength=0.0, reason="at MA")


STRATEGIES: dict[str, Strategy] = {
    "sma_crossover": sma_crossover,
    "momentum": momentum,
    "mean_reversion": mean_reversion,
}
