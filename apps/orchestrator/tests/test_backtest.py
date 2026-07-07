import math

from orchestrator.application.backtest import run_backtest
from orchestrator.application.metrics import max_drawdown, sharpe, step_returns, total_return
from orchestrator.application.signals import sma_crossover
from orchestrator.domain.backtest import BacktestConfig
from orchestrator.domain.strategy import Bar


def _bars(closes: list[float]) -> list[Bar]:
    return [
        Bar(ts=f"t{i}", open=c, high=c, low=c, close=c, volume=1.0)
        for i, c in enumerate(closes)
    ]


# --- metrics ---

def test_total_return() -> None:
    assert math.isclose(total_return([100.0, 110.0]), 0.1)
    assert total_return([100.0]) == 0.0


def test_max_drawdown() -> None:
    # 100 → 120 → 90 → 130: worst dd is (120-90)/120 = 0.25
    assert math.isclose(max_drawdown([100, 120, 90, 130]), 0.25)
    assert max_drawdown([100, 110, 120]) == 0.0  # monotonic up


def test_sharpe_zero_on_flat() -> None:
    assert sharpe([100.0, 100.0, 100.0], 252) == 0.0


def test_step_returns() -> None:
    rets = step_returns([100.0, 110.0, 121.0])
    assert len(rets) == 2
    assert all(math.isclose(r, 0.1) for r in rets)


# --- engine ---

def _uptrend() -> list[Bar]:
    return _bars([100.0 + i for i in range(80)])


def test_uptrend_profits_and_frictionless_beats_costed() -> None:
    up = _uptrend()
    free = run_backtest(
        "sma_crossover", "X", up, sma_crossover,
        BacktestConfig(warmup=30, fees_pct=0.0, slippage_pct=0.0),
    )
    costed = run_backtest(
        "sma_crossover", "X", up, sma_crossover,
        BacktestConfig(warmup=30, fees_pct=0.01, slippage_pct=0.005),
    )
    assert free.total_return > 0
    # fees + slippage strictly reduce return
    assert costed.total_return < free.total_return


def test_result_shape() -> None:
    r = run_backtest("sma_crossover", "BTC/USD", _uptrend(), sma_crossover, BacktestConfig())
    assert r.bars == 80
    assert len(r.equity_curve) == 80
    assert 0.0 <= r.win_rate <= 1.0
    assert r.max_drawdown >= 0.0
