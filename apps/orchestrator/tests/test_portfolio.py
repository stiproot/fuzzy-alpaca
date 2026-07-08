import math

from orchestrator.application.signals import sma_crossover
from orchestrator.application.walkforward import portfolio_walk_forward, walk_forward
from orchestrator.domain.backtest import BacktestConfig
from orchestrator.domain.strategy import Bar


def _bars(closes: list[float]) -> list[Bar]:
    return [
        Bar(ts=f"t{i}", open=c, high=c, low=c, close=c, volume=1.0)
        for i, c in enumerate(closes)
    ]


def _series() -> list[float]:
    # trend up then choppy — enough structure for sma_crossover to trade across folds
    up = [100.0 + i for i in range(200)]
    chop = [300.0 + 20.0 * math.sin(i / 4.0) for i in range(200)]
    return up + chop


def test_identical_sleeves_reduce_to_single_name() -> None:
    # A basket of N identical series must match the single-name OOS exactly (averaging identical
    # returns is the identity), except trades are summed across the N sleeves.
    bars = _bars(_series())
    cfg = BacktestConfig(warmup=30)
    single = walk_forward("sma_20_50", "X", bars, sma_crossover, cfg)
    basket = portfolio_walk_forward(
        "sma_20_50", {"A": bars, "B": bars, "C": bars}, sma_crossover, cfg
    )

    assert basket.folds == single.folds
    assert math.isclose(basket.oos_return, single.oos_return, rel_tol=1e-9, abs_tol=1e-9)
    assert math.isclose(basket.oos_sharpe, single.oos_sharpe, rel_tol=1e-6, abs_tol=1e-6)
    assert math.isclose(
        basket.oos_max_drawdown, single.oos_max_drawdown, rel_tol=1e-6, abs_tol=1e-6
    )
    assert basket.oos_trades == single.oos_trades * 3


def test_anti_correlated_sleeves_diversify_drawdown() -> None:
    # Two anti-phase series: the equal-weight basket's drawdown should not exceed the worse sleeve's
    # — diversification never increases drawdown for equal weights on offsetting return streams.
    a = _bars([100.0 + 15.0 * math.sin(i / 5.0) + 0.1 * i for i in range(400)])
    b = _bars([100.0 - 15.0 * math.sin(i / 5.0) + 0.1 * i for i in range(400)])
    cfg = BacktestConfig(warmup=30)
    sa = walk_forward("sma_20_50", "A", a, sma_crossover, cfg).oos_max_drawdown
    sb = walk_forward("sma_20_50", "B", b, sma_crossover, cfg).oos_max_drawdown
    basket = portfolio_walk_forward("sma_20_50", {"A": a, "B": b}, sma_crossover, cfg)
    assert basket.oos_max_drawdown <= max(sa, sb) + 1e-9


def test_basket_reports_name_count() -> None:
    bars = _bars(_series())
    basket = portfolio_walk_forward(
        "sma_20_50", {"A": bars, "B": bars}, sma_crossover, BacktestConfig(warmup=30)
    )
    assert "2-name basket" in basket.symbol
    assert basket.strategy == "basket:sma_20_50"
