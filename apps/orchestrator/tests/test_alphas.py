import math

from orchestrator.application.alphas import GTJA_SURVIVORS, gtja_002
from orchestrator.domain.strategy import Bar


def _bars(n: int) -> list[Bar]:
    # deterministic, wiggly, positive OHLCV with H > L on every bar
    out = []
    for i in range(n):
        close = 100.0 + 10.0 * math.sin(i / 3.0) + 0.5 * (i % 5)
        spread = 1.0 + 0.3 * (i % 3)
        out.append(
            Bar(
                ts=f"2024-{1 + i // 28:02d}-{1 + i % 28:02d}T05:00:00Z",
                open=close - 0.2 * spread,
                high=close + spread,
                low=close - spread,
                close=close,
                volume=1_000.0 + 37.0 * (i % 11),
            )
        )
    return out


def test_every_alpha_is_causal_prefix_invariant() -> None:
    # scores over a prefix must equal the prefix of scores over the full series — no lookahead
    bars = _bars(60)
    for name, fn in GTJA_SURVIVORS.items():
        full = fn(bars)
        for k in (25, 40, 59):
            assert fn(bars[:k]) == full[:k], f"{name} not causal at prefix {k}"


def test_every_alpha_returns_one_value_per_bar() -> None:
    bars = _bars(50)
    for name, fn in GTJA_SURVIVORS.items():
        series = fn(bars)
        assert len(series) == len(bars), name
        assert any(v is not None for v in series[30:]), f"{name} all-None after warmup"


def test_gtja_002_known_value() -> None:
    # close position within range: bar0 mid (raw 0), bar1 at high (raw 1) -> delta 1, score -1
    b0 = Bar(ts="t0", open=10, high=11, low=9, close=10, volume=1)
    b1 = Bar(ts="t1", open=10, high=11, low=9, close=11, volume=1)
    series = gtja_002([b0, b1])
    assert series[0] is None
    assert series[1] is not None and math.isclose(series[1], -1.0)


def test_degenerate_bar_yields_none_not_crash() -> None:
    flat = Bar(ts="t0", open=10, high=10, low=10, close=10, volume=100)  # H == L
    for name, fn in GTJA_SURVIVORS.items():
        series = fn([flat] * 15)
        assert len(series) == 15, name  # undefined days are None, never an exception
