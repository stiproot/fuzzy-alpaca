"""Cross-sectional walk-forward — cycle-7 experiment. Rank every name in an aligned universe by a
per-name alpha score each day; hold the top fraction equal-weight from close t to close t+1, with
per-side turnover costs. Same fold structure and gate-readable result shape as `walk_forward`, so
a cross-sectional pass means what a basket pass means. Pure."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from orchestrator.application.alphas import AlphaSeries
from orchestrator.application.metrics import max_drawdown, sharpe
from orchestrator.application.walkforward import _chunks
from orchestrator.domain.backtest import BacktestConfig, WalkForwardResult
from orchestrator.domain.strategy import Bar


def _smoothed(series: Sequence[float | None], window: int) -> list[float | None]:
    """Rolling mean of the last `window` non-None scores (None when none available)."""
    if window <= 1:
        return list(series)
    out: list[float | None] = []
    for i in range(len(series)):
        vals = [v for v in series[max(0, i + 1 - window) : i + 1] if v is not None]
        out.append(sum(vals) / len(vals) if vals else None)
    return out


def cross_sectional_walk_forward(
    name: str,
    symbol_bars: Mapping[str, Sequence[Bar]],
    alpha: AlphaSeries,
    config: BacktestConfig,
    folds: int = 4,
    top_frac: float = 0.2,
    cost_per_side: float = 0.0010,
    smooth: int = 1,
) -> WalkForwardResult:
    """Bars must be time-aligned across symbols. Each fold is evaluated independently (scores
    computed within the fold only, warmup respected), and the OOS curves are stitched exactly like
    `walk_forward`. `top_frac=1.0` is the hold-all control (no selection, cost model intact).
    Costs: each name entering or leaving the book trades 1/k of the portfolio at
    `cost_per_side`. Trades = name-entries. Win rate = fraction of positive portfolio days."""
    symbols = sorted(symbol_bars)
    curve: list[float] = [1.0]
    level = 1.0
    per_fold_returns: list[float] = []
    positive = 0
    trades = 0
    up_days = 0
    total_days = 0
    n_folds = 0

    for f in range(folds):
        fold_closes: dict[str, Sequence[float]] = {}
        fold_scores: dict[str, list[float | None]] = {}
        length: int | None = None
        for sym in symbols:
            chunks = _chunks(symbol_bars[sym], folds)
            if f >= len(chunks) or len(chunks[f]) <= config.warmup + 2:
                continue
            chunk = chunks[f]
            fold_closes[sym] = [b.close for b in chunk]
            fold_scores[sym] = _smoothed(alpha(chunk), smooth)
            length = len(chunk) if length is None else min(length, len(chunk))
        if not fold_closes or length is None:
            continue
        n_folds += 1

        port = [1.0]
        held: set[str] = set()
        for i in range(config.warmup, length - 1):
            scored = {
                s: v for s in fold_closes if (v := fold_scores[s][i]) is not None
            }
            if scored:
                k = max(1, round(top_frac * len(scored)))
                ordered = sorted(scored, key=lambda s: (-scored[s], s))
                top = set(ordered[:k])
            else:
                top = set()
            entries = top - held
            exits = held - top
            trades += len(entries)
            gross = (
                sum(fold_closes[s][i + 1] / fold_closes[s][i] - 1.0 for s in top) / len(top)
                if top
                else 0.0
            )
            cost = ((len(entries) + len(exits)) / len(top)) * cost_per_side if top else 0.0
            net = gross - cost
            port.append(port[-1] * (1.0 + net))
            up_days += 1 if net > 0 else 0
            total_days += 1
            held = top

        fold_total = port[-1] - 1.0
        per_fold_returns.append(fold_total)
        if fold_total > 0:
            positive += 1
        for e in port[1:]:
            curve.append(level * e)
        level *= port[-1]

    return WalkForwardResult(
        strategy=f"xsec:{name}",
        symbol=f"{len(symbols)}-name cross-sectional",
        folds=n_folds,
        positive_folds=positive,
        oos_return=(curve[-1] - 1.0) if len(curve) > 1 else 0.0,
        oos_sharpe=sharpe(curve, config.periods_per_year),
        oos_max_drawdown=max_drawdown(curve),
        oos_trades=trades,
        oos_win_rate=(up_days / total_days) if total_days else 0.0,
        per_fold_returns=tuple(per_fold_returns),
    )
