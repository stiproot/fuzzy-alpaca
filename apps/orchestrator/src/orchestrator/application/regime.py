"""Market-regime layer — cycle-6 experiment. Pure: a regime is a date-indexed risk-on/off series
derived from macro data (VIX term structure, credit spreads), applied as a signal wrapper that
forces flat when risk is off. Lookahead is structurally impossible: a bar's regime is the latest
macro observation strictly BEFORE the bar's date, so yesterday's close decides today's action and
gaps forward-fill through the same rule. The overlay only ever removes exposure — before any macro
data (or an unwarm window) it delegates to the strategy unchanged."""

from __future__ import annotations

import math
from bisect import bisect_left
from collections.abc import Sequence

from orchestrator.application.signals import Strategy
from orchestrator.domain.strategy import Bar, Signal

DatedValue = tuple[str, float]  # (YYYY-MM-DD, value)


class RegimeSeries:
    """Risk-on/off flags by date. `at(date)` returns the flag of the latest observation strictly
    before `date`; risk-on (True) when no observation precedes it."""

    def __init__(self, dated_flags: Sequence[tuple[str, bool]]) -> None:
        ordered = sorted(dated_flags)
        self._dates = [d for d, _ in ordered]
        self._flags = [f for _, f in ordered]

    def at(self, date: str) -> bool:
        i = bisect_left(self._dates, date)  # first observation >= date — we want the one before
        return self._flags[i - 1] if i > 0 else True

    @property
    def risk_off_frac(self) -> float:
        return (sum(1 for f in self._flags if not f) / len(self._flags)) if self._flags else 0.0


def ratio_regime(
    num: Sequence[DatedValue], den: Sequence[DatedValue], threshold: float = 1.0
) -> RegimeSeries:
    """Risk-on iff num/den > threshold, on dates present in both series (V1: VIX3M/VIX > 1.0 —
    term structure in contango)."""
    den_by_date = dict(den)
    flags = [
        (d, v / den_by_date[d] > threshold)
        for d, v in num
        if d in den_by_date and den_by_date[d] > 0
    ]
    return RegimeSeries(flags)


def zscore_regime(
    series: Sequence[DatedValue], window: int = 120, threshold: float = 1.0
) -> RegimeSeries:
    """Risk-off iff the causal z-score — value vs the trailing `window` observations up to and
    including it — exceeds threshold (V2: HY OAS z > +1.0 — credit spreads widening). Unwarm
    prefix (fewer than `window` observations) is risk-on."""
    ordered = sorted(series)
    values = [v for _, v in ordered]
    flags: list[tuple[str, bool]] = []
    for i, (d, v) in enumerate(ordered):
        if i + 1 < window:
            flags.append((d, True))
            continue
        w = values[i + 1 - window : i + 1]
        mean = sum(w) / len(w)
        sd = math.sqrt(sum((x - mean) ** 2 for x in w) / (len(w) - 1))
        flags.append((d, not (sd > 0 and (v - mean) / sd > threshold)))
    return RegimeSeries(flags)


def regime_filtered(signal_fn: Strategy, regime: RegimeSeries) -> Strategy:
    """Wrap a strategy: risk-off forces an exit-to-cash sell (real fees apply in the engine);
    risk-on delegates unchanged. Bar dates are the ts's YYYY-MM-DD prefix."""

    def fn(bars: Sequence[Bar]) -> Signal:
        if not regime.at(bars[-1].ts[:10]):
            return Signal(action="sell", strength=1.0, reason="regime risk-off")
        return signal_fn(bars)

    return fn
