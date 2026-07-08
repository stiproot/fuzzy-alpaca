"""Signal tier — pure strategy functions `list[Bar] -> Signal`. Insufficient data is expressed as
a hold with a reason, never an exception.

Cycle 1 proved naive price-only TA (crossover/momentum/mean-reversion) has no robust edge on the
crypto majors. Cycle 2 adds signals *beyond close price* — using the high/low/volume already on
every Bar: channel breakout (trend), volatility-scaled reversion, and volume-confirmed momentum."""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence

from orchestrator.domain.strategy import Bar, Signal

Strategy = Callable[[Sequence[Bar]], Signal]


def _sma(values: Sequence[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def _stddev(values: Sequence[float], period: int) -> float | None:
    """Sample standard deviation of the last `period` values (None if too short)."""
    if len(values) < period:
        return None
    window = values[-period:]
    mean = sum(window) / period
    var = sum((v - mean) ** 2 for v in window) / (period - 1)
    return math.sqrt(var)


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


def donchian_breakout(bars: Sequence[Bar], entry: int = 20, exit_: int = 10) -> Signal:
    """Trend-following channel breakout (Turtle-style), long-flat: go long when the close breaks
    above the highest high of the prior `entry` bars; exit when it breaks below the lowest low of
    the prior `exit_` bars. Uses the bar high/low, not just the close — a range signal, not a
    price-level one."""
    need = max(entry, exit_) + 1
    if len(bars) < need:
        return Signal(action="hold", strength=0.0, reason=f"need >= {need} bars, have {len(bars)}")
    close = bars[-1].close
    upper = max(b.high for b in bars[-entry - 1 : -1])  # prior `entry` bars, excludes current
    lower = min(b.low for b in bars[-exit_ - 1 : -1])
    if close > upper:
        strength = min(1.0, (close - upper) / upper * 50)
        return Signal(action="buy", strength=strength, reason=f"break above {entry}-bar high")
    if close < lower:
        strength = min(1.0, (lower - close) / lower * 50)
        return Signal(action="sell", strength=strength, reason=f"break below {exit_}-bar low")
    return Signal(action="hold", strength=0.0, reason="inside channel")


def bollinger_reversion(bars: Sequence[Bar], period: int = 20, k: float = 2.0) -> Signal:
    """Volatility-scaled mean reversion: measure the close's deviation from its moving average in
    units of rolling standard deviation (a z-score). Buy when oversold (z <= -k); exit once price
    reverts to the mean (z >= 0). Unlike naive mean_reversion's fixed % threshold, the band widens
    in volatile regimes and tightens in calm ones."""
    closes = [b.close for b in bars]
    ma = _sma(closes, period)
    sd = _stddev(closes, period)
    if ma is None or sd is None:
        return Signal(action="hold", strength=0.0, reason=f"need >= {period} bars, got {len(bars)}")
    if sd == 0:
        return Signal(action="hold", strength=0.0, reason="no dispersion")
    z = (closes[-1] - ma) / sd
    if z <= -k:
        return Signal(action="buy", strength=min(1.0, abs(z) / (k * 2)), reason=f"z={z:.2f}<=-{k}")
    if z >= 0:
        return Signal(action="sell", strength=min(1.0, z / (k * 2)), reason=f"z={z:.2f} reverted")
    return Signal(action="hold", strength=0.0, reason=f"z={z:.2f} in band")


def volume_momentum(
    bars: Sequence[Bar], lookback: int = 20, vol_window: int = 20, vol_mult: float = 1.2
) -> Signal:
    """Momentum confirmed by participation: go long on positive lookback return *only* when the
    latest bar's volume exceeds `vol_mult`x its recent average (a move on rising volume is more
    likely to continue than a thin drift). Exit on negative momentum. Uses the volume field the
    price-only strategies ignore."""
    need = max(lookback, vol_window) + 1
    if len(bars) < need:
        return Signal(action="hold", strength=0.0, reason=f"need > {need} bars, have {len(bars)}")
    closes = [b.close for b in bars]
    ret = (closes[-1] - closes[-1 - lookback]) / closes[-1 - lookback]
    avg_vol = sum(b.volume for b in bars[-vol_window:]) / vol_window
    confirmed = avg_vol > 0 and bars[-1].volume >= vol_mult * avg_vol
    if ret > 0 and confirmed:
        return Signal(action="buy", strength=min(1.0, abs(ret) * 10), reason=f"+{ret:.4f} on vol")
    if ret < 0:
        return Signal(action="sell", strength=min(1.0, abs(ret) * 10), reason=f"{ret:.4f} momentum")
    return Signal(action="hold", strength=0.0, reason="no confirmed momentum")


STRATEGIES: dict[str, Strategy] = {
    "sma_crossover": sma_crossover,
    "momentum": momentum,
    "mean_reversion": mean_reversion,
    "donchian_breakout": donchian_breakout,
    "bollinger_reversion": bollinger_reversion,
    "volume_momentum": volume_momentum,
}
