"""Strategy gate — the pass/block contract a strategy must clear (out-of-sample) before it may
trade live. Frozen; the evaluation (application/gate) is pure. Default is strict: block."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class GateCriteria(Frozen):
    min_sharpe: float = 0.5
    min_return: float = 0.0
    max_drawdown: float = 0.25
    min_trades: int = 5
    min_positive_folds_frac: float = 0.5


class GateVerdict(Frozen):
    passed: bool
    reasons: tuple[str, ...]  # one entry per failed criterion; empty when passed
