from orchestrator.application.gate import evaluate
from orchestrator.application.signals import sma_crossover
from orchestrator.application.walkforward import walk_forward
from orchestrator.domain.backtest import BacktestConfig, WalkForwardResult
from orchestrator.domain.gate import GateCriteria
from orchestrator.domain.strategy import Bar


def _bars(closes: list[float]) -> list[Bar]:
    return [
        Bar(ts=f"t{i}", open=c, high=c, low=c, close=c, volume=1.0)
        for i, c in enumerate(closes)
    ]


def test_walk_forward_folds_evaluable() -> None:
    bars = _bars([100.0 + i for i in range(400)])
    wf = walk_forward(
        "sma_crossover", "X", bars, sma_crossover,
        BacktestConfig(warmup=30, fees_pct=0.0, slippage_pct=0.0), folds=4,
    )
    assert wf.folds >= 2
    assert len(wf.per_fold_returns) == wf.folds
    assert 0.0 <= wf.positive_folds_frac <= 1.0


def test_too_few_bars_blocks() -> None:
    wf = walk_forward("sma_crossover", "X", _bars([1.0] * 40), sma_crossover, BacktestConfig())
    verdict = evaluate(wf, GateCriteria())
    assert verdict.passed is False
    assert any("folds" in r for r in verdict.reasons)


# --- gate evaluation (pure, over a constructed OOS result) ---

def _wf(**kw: float | int) -> WalkForwardResult:
    base: dict[str, object] = dict(
        strategy="s", symbol="X", folds=4, positive_folds=3,
        oos_return=0.2, oos_sharpe=1.0, oos_max_drawdown=0.1,
        oos_trades=10, oos_win_rate=0.6, per_fold_returns=(0.1, 0.1, -0.02, 0.05),
    )
    base.update(kw)
    return WalkForwardResult(**base)  # type: ignore[arg-type]


def test_passes_when_all_criteria_met() -> None:
    assert evaluate(_wf(), GateCriteria()).passed is True


def test_blocks_low_sharpe_with_reason() -> None:
    v = evaluate(_wf(oos_sharpe=-0.3), GateCriteria(min_sharpe=0.5))
    assert v.passed is False
    assert any("sharpe" in r for r in v.reasons)


def test_blocks_high_drawdown() -> None:
    v = evaluate(_wf(oos_max_drawdown=0.4), GateCriteria(max_drawdown=0.25))
    assert v.passed is False
    assert any("drawdown" in r for r in v.reasons)


def test_blocks_inconsistent_folds() -> None:
    v = evaluate(_wf(positive_folds=1, folds=4), GateCriteria(min_positive_folds_frac=0.5))
    assert v.passed is False
    assert any("positive folds" in r for r in v.reasons)
