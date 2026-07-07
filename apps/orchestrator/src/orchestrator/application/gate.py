"""Pure gate evaluation — a strategy passes only if every out-of-sample criterion holds. Each
failure yields a reason, so a block is always explainable in the journal."""

from __future__ import annotations

from orchestrator.domain.backtest import WalkForwardResult
from orchestrator.domain.gate import GateCriteria, GateVerdict


def evaluate(oos: WalkForwardResult, criteria: GateCriteria) -> GateVerdict:
    reasons: list[str] = []
    if oos.folds < 2:
        reasons.append(f"only {oos.folds} evaluable folds (need >= 2)")
    if oos.oos_sharpe < criteria.min_sharpe:
        reasons.append(f"OOS sharpe {oos.oos_sharpe:.2f} < {criteria.min_sharpe}")
    if oos.oos_return < criteria.min_return:
        reasons.append(f"OOS return {oos.oos_return:.2%} < {criteria.min_return:.2%}")
    if oos.oos_max_drawdown > criteria.max_drawdown:
        reasons.append(f"OOS drawdown {oos.oos_max_drawdown:.2%} > {criteria.max_drawdown:.2%}")
    if oos.oos_trades < criteria.min_trades:
        reasons.append(f"OOS trades {oos.oos_trades} < {criteria.min_trades}")
    if oos.positive_folds_frac < criteria.min_positive_folds_frac:
        reasons.append(
            f"positive folds {oos.positive_folds_frac:.0%} < "
            f"{criteria.min_positive_folds_frac:.0%}"
        )
    return GateVerdict(passed=not reasons, reasons=tuple(reasons))
