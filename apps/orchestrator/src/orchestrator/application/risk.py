"""Decision/risk tier — the non-negotiable deterministic math that turns a signal into a sized
order (or a no-op). Pure. Percent-risk sizing: size the position so that hitting the assumed stop
loses `risk_pct` of equity, then clamp to the hard caps."""

from __future__ import annotations

from orchestrator.domain.strategy import RiskLimits, Signal, StrategyDecision


def size_fixed_fractional(equity: float, limits: RiskLimits) -> float:
    """Position notional ($) such that a stop at `stop_distance_pct` costs `risk_pct` of equity.

    notional = (equity * risk_pct) / stop_distance_pct, clamped to max_position_notional.
    """
    if equity <= 0 or limits.stop_distance_pct <= 0:
        return 0.0
    risk_amount = equity * limits.risk_pct
    notional = risk_amount / limits.stop_distance_pct
    return min(notional, limits.max_position_notional)


def decide(
    signal: Signal,
    symbol: str,
    equity: float,
    current_exposure: float,
    limits: RiskLimits,
) -> StrategyDecision:
    """Compose signal + account state + limits into a concrete decision.

    Only `buy` acts (this MVP goes long or stays flat; a `sell` signal with no position is a hold,
    a real short/close comes with position management in a later phase)."""
    if signal.action != "buy":
        return StrategyDecision(
            action="hold", symbol=symbol, notional=None,
            rationale=f"signal={signal.action}: no long entry", signal=signal,
        )

    target = size_fixed_fractional(equity, limits)
    headroom = max(0.0, limits.max_position_notional - current_exposure)
    notional = min(target, headroom)

    if notional < limits.min_order_notional:
        return StrategyDecision(
            action="hold", symbol=symbol, notional=None,
            rationale=(
                f"sized ${notional:.2f} < floor ${limits.min_order_notional:.2f} "
                f"(target ${target:.2f}, headroom ${headroom:.2f})"
            ),
            signal=signal,
        )

    return StrategyDecision(
        action="buy", symbol=symbol, notional=f"{notional:.2f}",
        rationale=f"buy ${notional:.2f} (strength {signal.strength:.2f}): {signal.reason}",
        signal=signal,
    )
