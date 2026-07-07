"""Strategy domain — signals and decisions. Frozen values; the logic that produces them
(application/signals, application/risk) is pure. Bar/indicator math uses floats (informational
market data); the money that crosses to the gateway is formatted to a decimal string at the edge."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

Action = Literal["buy", "sell", "hold"]


class Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Bar(Frozen):
    ts: str  # ISO-8601
    open: float
    high: float
    low: float
    close: float
    volume: float


class Signal(Frozen):
    action: Action
    strength: float  # 0..1 confidence
    reason: str


class RiskLimits(Frozen):
    risk_pct: float = 0.01  # fraction of equity risked per trade
    stop_distance_pct: float = 0.02  # assumed stop distance for percent-risk sizing
    max_position_notional: float = 1000.0  # hard cap per order ($)
    min_order_notional: float = 10.0  # below this → hold (also Alpaca's crypto floor)


class StrategyDecision(Frozen):
    action: Action
    symbol: str
    notional: str | None  # decimal string for the gateway; None on hold
    rationale: str
    signal: Signal
