import math

from orchestrator.application.backtest import run_backtest
from orchestrator.application.signals import sma_crossover
from orchestrator.application.sizing import full_size, realized_vol, vol_target_sizer
from orchestrator.domain.backtest import BacktestConfig
from orchestrator.domain.strategy import Bar


def _bars(closes: list[float]) -> list[Bar]:
    return [
        Bar(ts=f"t{i}", open=c, high=c, low=c, close=c, volume=1.0)
        for i, c in enumerate(closes)
    ]


def test_full_size_is_all_in() -> None:
    assert full_size(_bars([1.0, 2.0])) == 1.0


def test_realized_vol_none_when_short() -> None:
    assert realized_vol(_bars([1.0]), window=20, periods_per_year=365) is None


def test_realized_vol_higher_for_choppier_series() -> None:
    calm = _bars([100.0 + 0.1 * (i % 2) for i in range(30)])
    wild = _bars([100.0 + 10.0 * (i % 2) for i in range(30)])
    rv_calm = realized_vol(calm, window=20, periods_per_year=365)
    rv_wild = realized_vol(wild, window=20, periods_per_year=365)
    assert rv_calm is not None and rv_wild is not None
    assert rv_wild > rv_calm


def test_vol_target_caps_at_max_fraction() -> None:
    # very calm series → target/realized is huge → clamped to max_fraction (no leverage)
    sizer = vol_target_sizer(target_ann_vol=0.4, window=20, periods_per_year=365, max_fraction=1.0)
    calm = _bars([100.0 + 0.001 * (i % 2) for i in range(30)])
    assert sizer(calm) == 1.0


def test_vol_target_reduces_in_high_vol() -> None:
    sizer = vol_target_sizer(target_ann_vol=0.4, window=20, periods_per_year=365)
    wild = _bars([100.0 * (1.05 if i % 2 else 0.95) for i in range(30)])
    frac = sizer(wild)
    assert 0.0 < frac < 1.0


def test_sized_backtest_matches_full_when_full_size() -> None:
    # full_size sizer must reproduce the default all-in engine exactly
    up = _bars([100.0 + i for i in range(80)])
    cfg = BacktestConfig(warmup=30)
    default = run_backtest("sma_crossover", "X", up, sma_crossover, cfg)
    explicit = run_backtest("sma_crossover", "X", up, sma_crossover, cfg, sizer=full_size)
    assert math.isclose(default.final_equity, explicit.final_equity)
    assert math.isclose(default.total_return, explicit.total_return)


def test_smaller_target_vol_reduces_drawdown() -> None:
    # a volatile up-then-down series: lower vol target => less exposure => smaller drawdown
    closes = [100.0 + 30.0 * math.sin(i / 3.0) + i for i in range(120)]
    bars = _bars(closes)
    cfg = BacktestConfig(warmup=30)
    aggressive = run_backtest(
        "sma_crossover", "X", bars, sma_crossover, cfg,
        sizer=vol_target_sizer(1.0, 20, cfg.periods_per_year),
    )
    conservative = run_backtest(
        "sma_crossover", "X", bars, sma_crossover, cfg,
        sizer=vol_target_sizer(0.1, 20, cfg.periods_per_year),
    )
    assert conservative.max_drawdown <= aggressive.max_drawdown
