import math

from orchestrator.application.cross_sectional import _smoothed, cross_sectional_walk_forward
from orchestrator.domain.backtest import BacktestConfig
from orchestrator.domain.strategy import Bar

CFG = BacktestConfig(warmup=5, periods_per_year=252.0)


def _series(closes: list[float]) -> list[Bar]:
    return [
        Bar(ts=f"t{i:03d}", open=c, high=c * 1.01, low=c * 0.99, close=c, volume=100.0)
        for i, c in enumerate(closes)
    ]


def _universe(trends: dict[str, float], n: int = 60) -> dict[str, list[Bar]]:
    return {sym: _series([100.0 * (1.0 + g) ** i for i in range(n)]) for sym, g in trends.items()}


def _const_alpha(value: float):
    def fn(bars):
        return [value] * len(bars)

    return fn


def _favor(value_by_volume: dict[float, float]):
    """Alpha scoring each name by a fixed value, keyed on the bars' (constant, per-symbol unique)
    volume — stable across fold slicing."""

    def fn(bars):
        return [value_by_volume[bars[0].volume]] * len(bars)

    return fn


def test_smoothed_window_one_is_identity() -> None:
    s = [None, 1.0, 2.0, None]
    assert _smoothed(s, 1) == s


def test_smoothed_averages_recent_non_none() -> None:
    assert _smoothed([1.0, None, 3.0], 3) == [1.0, 1.0, 2.0]


def test_hold_all_control_tracks_universe_mean() -> None:
    uni = _universe({"UP": 0.002, "FLAT": 0.0})
    r = cross_sectional_walk_forward("ctl", uni, _const_alpha(0.0), CFG, folds=2,
                                     top_frac=1.0, cost_per_side=0.0)
    # equal-weight of +0.2%/day and flat ≈ +0.1%/day compounded
    assert r.oos_return > 0
    assert r.folds == 2 and r.positive_folds == 2


def test_selection_beats_hold_all_when_alpha_is_informative() -> None:
    trends = {"A": 0.003, "B": 0.0, "C": -0.003}
    # distinct constant volume per symbol so the alpha closure can tell them apart
    uni = {
        sym: [
            Bar(ts=f"t{i:03d}", open=c, high=c * 1.01, low=c * 0.99, close=c,
                volume=float(100 + j))
            for i, c in enumerate([100.0 * (1.0 + g) ** i for i in range(60)])
        ]
        for j, (sym, g) in enumerate(trends.items())
    }
    informed = _favor({100.0: 1.0, 101.0: 0.5, 102.0: 0.0})  # favors A
    top = cross_sectional_walk_forward("top", uni, informed, CFG, folds=2,
                                       top_frac=0.34, cost_per_side=0.0)
    all_ = cross_sectional_walk_forward("all", uni, informed, CFG, folds=2,
                                        top_frac=1.0, cost_per_side=0.0)
    assert top.oos_return > all_.oos_return  # picks A only

def test_costs_reduce_return_and_static_book_pays_once_per_fold() -> None:
    uni = _universe({"A": 0.001, "B": 0.0005, "C": 0.0})
    free = cross_sectional_walk_forward("f", uni, _const_alpha(1.0), CFG, folds=1,
                                        top_frac=1.0, cost_per_side=0.0)
    paid = cross_sectional_walk_forward("p", uni, _const_alpha(1.0), CFG, folds=1,
                                        top_frac=1.0, cost_per_side=0.001)
    # constant scores -> book never changes -> exactly one entry cost of 3/3 * 10bps
    assert paid.oos_trades == 3
    assert math.isclose(free.oos_return - paid.oos_return, 0.001, rel_tol=0.15)


def test_deterministic_tiebreak_on_equal_scores() -> None:
    uni = _universe({"B": 0.001, "A": 0.001, "C": 0.001})
    r1 = cross_sectional_walk_forward("d", uni, _const_alpha(1.0), CFG, folds=1, top_frac=0.34)
    r2 = cross_sectional_walk_forward("d", uni, _const_alpha(1.0), CFG, folds=1, top_frac=0.34)
    assert r1.oos_return == r2.oos_return and r1.oos_trades == r2.oos_trades


def test_all_none_scores_hold_cash() -> None:
    def none_alpha(bars):
        return [None] * len(bars)

    uni = _universe({"A": 0.002, "B": -0.002})
    r = cross_sectional_walk_forward("n", uni, none_alpha, CFG, folds=1)
    assert r.oos_return == 0.0 and r.oos_trades == 0
