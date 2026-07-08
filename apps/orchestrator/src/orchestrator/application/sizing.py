"""Position sizing — pure `list[Bar] -> fraction of cash to deploy at entry`, in (0, 1]. This is
the risk lever Experiment 2 identified as missing: the engine was all-in long-flat, so drawdown was
unmanaged by construction. A sizer never leverages (fraction is capped at 1.0); `full_size` (deploy
everything) reproduces the original all-in behavior and is the default everywhere.

Only the *research* backtest engine consumes these; the live money path sizes via application/risk
(RiskLimits), so nothing here touches order safety."""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence

from orchestrator.application.metrics import step_returns
from orchestrator.domain.strategy import Bar

Sizer = Callable[[Sequence[Bar]], float]


def full_size(_bars: Sequence[Bar]) -> float:
    """Deploy all available cash — the all-in baseline (unchanged engine behavior)."""
    return 1.0


def realized_vol(bars: Sequence[Bar], window: int, periods_per_year: float) -> float | None:
    """Annualized realized volatility from the last `window` close-to-close returns (None if the
    window is too short to have dispersion)."""
    closes = [b.close for b in bars]
    rets = step_returns(closes[-(window + 1):])
    if len(rets) < 2:
        return None
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    return math.sqrt(var) * math.sqrt(periods_per_year)


def vol_target_sizer(
    target_ann_vol: float,
    window: int,
    periods_per_year: float,
    max_fraction: float = 1.0,
    min_fraction: float = 0.05,
) -> Sizer:
    """Volatility targeting: deploy `target_ann_vol / recent_realized_vol` of cash, so exposure
    falls in turbulent regimes (where drawdowns happen) and rises in calm ones — never above
    `max_fraction` (no leverage). Until there is enough history to measure vol, size at
    `max_fraction`."""

    def size(bars: Sequence[Bar]) -> float:
        rv = realized_vol(bars, window, periods_per_year)
        if rv is None or rv <= 0:
            return max_fraction
        return max(min_fraction, min(max_fraction, target_ann_vol / rv))

    return size
