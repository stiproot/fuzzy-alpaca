"""Backtest domain — config and results. Frozen; the engine (application/backtest) is pure."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from orchestrator.domain.strategy import RiskLimits


class Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class BacktestConfig(Frozen):
    starting_cash: float = 10_000.0
    fees_pct: float = 0.0025  # taker fee per fill (crypto tier 1 ~0.25%)
    slippage_pct: float = 0.0005  # adverse price move per fill
    warmup: int = 30  # bars before the strategy may trade (indicator lookback)
    periods_per_year: float = 252.0  # for annualized Sharpe (daily default)
    limits: RiskLimits = RiskLimits()


class Trade(Frozen):
    entry_ts: str
    entry_price: float
    exit_ts: str
    exit_price: float
    qty: float
    pnl: float


class BacktestResult(Frozen):
    strategy: str
    symbol: str
    bars: int
    total_return: float
    sharpe: float
    max_drawdown: float
    num_trades: int
    win_rate: float
    final_equity: float
    trades: tuple[Trade, ...]
    equity_curve: tuple[float, ...]
