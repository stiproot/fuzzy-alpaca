"""Pure performance metrics over an equity curve. No I/O, no state."""

from __future__ import annotations

import math
from collections.abc import Sequence


def step_returns(equity: Sequence[float]) -> list[float]:
    """Per-step simple returns of an equity curve."""
    out: list[float] = []
    for prev, cur in zip(equity, equity[1:], strict=False):
        if prev != 0:
            out.append(cur / prev - 1.0)
    return out


def total_return(equity: Sequence[float]) -> float:
    if len(equity) < 2 or equity[0] == 0:
        return 0.0
    return equity[-1] / equity[0] - 1.0


def sharpe(equity: Sequence[float], periods_per_year: float) -> float:
    """Annualized Sharpe (risk-free 0). 0 when there is no dispersion or too little data."""
    rets = step_returns(equity)
    if len(rets) < 2:
        return 0.0
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    sd = math.sqrt(var)
    if sd == 0:
        return 0.0
    return (mean / sd) * math.sqrt(periods_per_year)


def max_drawdown(equity: Sequence[float]) -> float:
    """Largest peak-to-trough decline as a positive fraction (0.2 == -20%)."""
    peak = -math.inf
    worst = 0.0
    for e in equity:
        peak = max(peak, e)
        if peak > 0:
            worst = max(worst, (peak - e) / peak)
    return worst
