"""Pure walk-forward evaluation — run the strategy across contiguous out-of-sample folds and
stitch a compounded OOS equity curve. The engine already computes signals causally (bars[:i+1]),
so per-fold runs never look ahead; walk-forward adds the honesty of requiring the edge to hold
across multiple windows, not just the full sample. Pure."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from orchestrator.application.backtest import run_backtest
from orchestrator.application.metrics import max_drawdown, sharpe
from orchestrator.application.signals import Strategy
from orchestrator.application.sizing import Sizer, full_size
from orchestrator.domain.backtest import BacktestConfig, WalkForwardResult
from orchestrator.domain.strategy import Bar


def _chunks(bars: Sequence[Bar], folds: int) -> list[Sequence[Bar]]:
    n = len(bars)
    size = n // folds
    return [bars[i * size : (i + 1) * size] for i in range(folds)] if size else []


def walk_forward(
    strategy_name: str,
    symbol: str,
    bars: Sequence[Bar],
    signal_fn: Strategy,
    config: BacktestConfig,
    folds: int = 4,
    sizer: Sizer = full_size,
) -> WalkForwardResult:
    evaluable = [c for c in _chunks(bars, folds) if len(c) > config.warmup + 2]

    per_fold_returns: list[float] = []
    positive = 0
    trades = 0
    wins = 0.0
    # compounded OOS curve stitched across folds (each fold normalized to its own start)
    curve: list[float] = [1.0]
    level = 1.0

    for chunk in evaluable:
        r = run_backtest(strategy_name, symbol, chunk, signal_fn, config, sizer)
        per_fold_returns.append(r.total_return)
        if r.total_return > 0:
            positive += 1
        trades += r.num_trades
        wins += r.win_rate * r.num_trades
        ec = r.equity_curve
        base = ec[0] if ec else config.starting_cash
        for e in ec[1:]:
            curve.append(level * (e / base))
        if ec:
            level *= ec[-1] / base

    n_folds = len(evaluable)
    return WalkForwardResult(
        strategy=strategy_name,
        symbol=symbol,
        folds=n_folds,
        positive_folds=positive,
        oos_return=(curve[-1] - 1.0) if len(curve) > 1 else 0.0,
        oos_sharpe=sharpe(curve, config.periods_per_year),
        oos_max_drawdown=max_drawdown(curve),
        oos_trades=trades,
        oos_win_rate=(wins / trades) if trades else 0.0,
        per_fold_returns=tuple(per_fold_returns),
    )


def _step_returns(curve: Sequence[float]) -> list[float]:
    return [curve[i] / curve[i - 1] - 1.0 for i in range(1, len(curve)) if curve[i - 1] != 0]


def portfolio_walk_forward(
    name: str,
    symbol_bars: Mapping[str, Sequence[Bar]],
    signal_fn: Strategy,
    config: BacktestConfig,
    folds: int = 4,
    sizer: Sizer = full_size,
) -> WalkForwardResult:
    """Walk-forward on an equal-weight, daily-rebalanced BASKET of one strategy across many symbols.
    Each symbol runs the same long-flat strategy as an independent 1/N sleeve (idle in cash when
    flat); the portfolio bar return is the mean of the sleeves' bar returns. Diversification is the
    point: a weak-but-broad per-name edge should compound into a higher portfolio Sharpe than any
    single name. Bars must be time-aligned across symbols (same timeframe/window); each fold is
    truncated to the common length. Same OOS shape the gate reads, so a basket pass means what a
    single-name pass means — but robustly."""
    symbols = list(symbol_bars)
    curve: list[float] = [1.0]
    level = 1.0
    per_fold_returns: list[float] = []
    positive = 0
    trades = 0
    wins = 0.0
    n_folds = 0

    for f in range(folds):
        sleeve_curves: list[Sequence[float]] = []
        for sym in symbols:
            chunks = _chunks(symbol_bars[sym], folds)
            if f >= len(chunks):
                continue
            chunk = chunks[f]
            if len(chunk) <= config.warmup + 2:
                continue
            r = run_backtest(name, sym, chunk, signal_fn, config, sizer)
            sleeve_curves.append(r.equity_curve)
            trades += r.num_trades
            wins += r.win_rate * r.num_trades
        if not sleeve_curves:
            continue
        n_folds += 1
        # equal-weight, per-bar rebalanced: portfolio bar return = mean of sleeve bar returns
        length = min(len(c) for c in sleeve_curves)
        sleeve_rets = [_step_returns(c[:length]) for c in sleeve_curves]
        steps = min(len(r) for r in sleeve_rets) if sleeve_rets else 0
        port = [1.0]
        for i in range(steps):
            bar_ret = sum(sr[i] for sr in sleeve_rets) / len(sleeve_rets)
            port.append(port[-1] * (1.0 + bar_ret))
        fold_total = port[-1] - 1.0
        per_fold_returns.append(fold_total)
        if fold_total > 0:
            positive += 1
        for e in port[1:]:
            curve.append(level * e)  # port already starts at 1.0
        level *= port[-1]

    return WalkForwardResult(
        strategy=f"basket:{name}",
        symbol=f"{len(symbols)}-name basket",
        folds=n_folds,
        positive_folds=positive,
        oos_return=(curve[-1] - 1.0) if len(curve) > 1 else 0.0,
        oos_sharpe=sharpe(curve, config.periods_per_year),
        oos_max_drawdown=max_drawdown(curve),
        oos_trades=trades,
        oos_win_rate=(wins / trades) if trades else 0.0,
        per_fold_returns=tuple(per_fold_returns),
    )
