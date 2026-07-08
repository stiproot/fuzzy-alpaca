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
    # Annualization factor for Sharpe. MUST match the bar timeframe or the metric lies — a bar is
    # not a "day". Default is daily-crypto (365); build with periods_per_year() for anything else.
    periods_per_year: float = 365.0
    limits: RiskLimits = RiskLimits()


# Seconds in an active trading year, by asset class. Crypto never closes; equities trade the
# regular session (~6.5h) over ~252 days. Used to turn a bar timeframe into bars-per-year.
_YEAR_SECONDS = {"crypto": 365 * 24 * 3600, "equity": int(252 * 6.5 * 3600)}
_UNIT_SECONDS = {"Min": 60, "Hour": 3600, "Day": 86400, "Week": 604800}


def periods_per_year(timeframe: str, asset_class: str = "crypto") -> float:
    """Bars per year for a timeframe, so annualized Sharpe is honest (a 1Hour bar is not a day).
    Crypto: 1Day=365, 1Hour=8760. Equity (regular session): 1Day=252, 1Hour=1638. Falls back to
    daily-crypto (365) on an unrecognized timeframe."""
    unit = next((u for u in _UNIT_SECONDS if timeframe.endswith(u)), None)
    if unit is None:
        return 365.0
    n = int(timeframe[: -len(unit)] or 1)
    bar_seconds = _UNIT_SECONDS[unit] * n
    year = _YEAR_SECONDS.get(asset_class, _YEAR_SECONDS["crypto"])
    return year / bar_seconds


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


class WalkForwardResult(Frozen):
    """Out-of-sample aggregate across contiguous folds — the honest evaluation the gate reads."""

    strategy: str
    symbol: str
    folds: int
    positive_folds: int
    oos_return: float
    oos_sharpe: float
    oos_max_drawdown: float
    oos_trades: int
    oos_win_rate: float
    per_fold_returns: tuple[float, ...]

    @property
    def positive_folds_frac(self) -> float:
        return (self.positive_folds / self.folds) if self.folds else 0.0
