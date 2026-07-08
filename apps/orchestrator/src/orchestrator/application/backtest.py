"""Pure backtest engine — replay a strategy over bars, long-flat, with fees + slippage first-class
so a frictionless mirage can't pass. Deterministic: no I/O, no clock, no randomness."""

from __future__ import annotations

from collections.abc import Sequence

from orchestrator.application.metrics import max_drawdown, sharpe, total_return
from orchestrator.application.signals import Strategy
from orchestrator.application.sizing import Sizer, full_size
from orchestrator.domain.backtest import BacktestConfig, BacktestResult, Trade
from orchestrator.domain.strategy import Bar


def run_backtest(
    strategy_name: str,
    symbol: str,
    bars: Sequence[Bar],
    signal_fn: Strategy,
    config: BacktestConfig,
    sizer: Sizer = full_size,
) -> BacktestResult:
    cash = config.starting_cash
    qty = 0.0  # >0 == long
    entry_price = 0.0
    entry_ts = ""
    trades: list[Trade] = []
    equity_curve: list[float] = []

    for i, bar in enumerate(bars):
        price = bar.close

        if i >= config.warmup:
            action = signal_fn(bars[: i + 1]).action
            if action == "buy" and qty == 0.0 and cash > 0:
                # Deploy the sizer's fraction of cash; keep the remainder uninvested (risk lever).
                invest = cash * max(0.0, min(1.0, sizer(bars[: i + 1])))
                fill = price * (1 + config.slippage_pct)
                fee = invest * config.fees_pct
                qty = (invest - fee) / fill
                entry_price, entry_ts, cash = fill, bar.ts, cash - invest
            elif action == "sell" and qty > 0.0:
                fill = price * (1 - config.slippage_pct)
                proceeds = qty * fill
                net = proceeds - proceeds * config.fees_pct
                cash += net
                pnl = net - qty * entry_price
                trades.append(
                    Trade(
                        entry_ts=entry_ts, entry_price=entry_price,
                        exit_ts=bar.ts, exit_price=fill, qty=qty, pnl=pnl,
                    )
                )
                qty = 0.0

        equity_curve.append(cash + qty * price)

    # mark an open position to the last close (no forced exit fee — unrealized)
    wins = sum(1 for t in trades if t.pnl > 0)
    return BacktestResult(
        strategy=strategy_name,
        symbol=symbol,
        bars=len(bars),
        total_return=total_return(equity_curve),
        sharpe=sharpe(equity_curve, config.periods_per_year),
        max_drawdown=max_drawdown(equity_curve),
        num_trades=len(trades),
        win_rate=(wins / len(trades)) if trades else 0.0,
        final_equity=equity_curve[-1] if equity_curve else config.starting_cash,
        trades=tuple(trades),
        equity_curve=tuple(equity_curve),
    )
