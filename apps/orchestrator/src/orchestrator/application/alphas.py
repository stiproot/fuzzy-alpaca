"""Cross-sectional alpha scores — cycle-7 experiment. Pure per-name score *series* over bars:
`AlphaSeries(bars) -> list[float | None]`, one value per bar, each computed from data up to and
including that bar only (causal by construction — tested via the prefix invariant). None = the
score is undefined that day (warmup, or a degenerate bar like H == L) and the name drops out of
that day's cross-sectional ranking.

The five functions are faithful ports of vibe-trading's surviving GTJA-191 alphas
(`agent/src/factors/zoo/gtja191/`, per docs/experiments/007-gtja-survivors-us.md). The
cross-sectional `rank()` in the originals of 054/163 is order-preserving per day, so the
per-name inner value is ranked by the evaluator instead. VWAP uses (O+H+L+C)/4 — vibe-trading's
own `equity_us` fallback. `safe_div` mirrors theirs: |denominator| < 1e-12 -> undefined."""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence

from orchestrator.domain.strategy import Bar

AlphaSeries = Callable[[Sequence[Bar]], "list[float | None]"]

_EPS = 1e-12


def _safe_div(a: float, b: float) -> float | None:
    return a / b if abs(b) > _EPS else None


def _roll_mean(values: Sequence[float], n: int, i: int) -> float | None:
    if i + 1 < n:
        return None
    window = values[i + 1 - n : i + 1]
    return sum(window) / n


def _roll_std(values: Sequence[float], n: int, i: int) -> float | None:
    if i + 1 < n:
        return None
    window = values[i + 1 - n : i + 1]
    mean = sum(window) / n
    return math.sqrt(sum((x - mean) ** 2 for x in window) / (n - 1))


def _roll_corr(xs: Sequence[float], ys: Sequence[float], n: int, i: int) -> float | None:
    if i + 1 < n:
        return None
    x = xs[i + 1 - n : i + 1]
    y = ys[i + 1 - n : i + 1]
    mx = sum(x) / n
    my = sum(y) / n
    sxx = sum((a - mx) ** 2 for a in x)
    syy = sum((b - my) ** 2 for b in y)
    if sxx <= _EPS or syy <= _EPS:
        return None  # constant series in window — no silent zero (matches their ts_corr)
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y, strict=True))
    return sxy / math.sqrt(sxx * syy)


def gtja_002(bars: Sequence[Bar]) -> list[float | None]:
    """-1 * DELTA(((CLOSE-LOW)-(HIGH-CLOSE))/(HIGH-LOW), 1) — reversal/microstructure."""
    raw = [_safe_div((b.close - b.low) - (b.high - b.close), b.high - b.low) for b in bars]
    out: list[float | None] = [None] * len(bars)
    for i in range(1, len(bars)):
        a, b = raw[i], raw[i - 1]
        if a is not None and b is not None:
            out[i] = -(a - b)
    return out


def gtja_054(bars: Sequence[Bar]) -> list[float | None]:
    """-1 * rank(STD(|C-O|,10) + (C-O) + CORR(C,O,10)) — volatility/microstructure. Per-name
    inner value; the cross-sectional rank is applied by the evaluator (order-preserving)."""
    body = [abs(b.close - b.open) for b in bars]
    closes = [b.close for b in bars]
    opens = [b.open for b in bars]
    out: list[float | None] = [None] * len(bars)
    for i in range(len(bars)):
        sd = _roll_std(body, 10, i)
        corr = _roll_corr(closes, opens, 10, i)
        if sd is not None and corr is not None:
            out[i] = -(sd + (bars[i].close - bars[i].open) + corr)
    return out


def gtja_111(bars: Sequence[Bar]) -> list[float | None]:
    """SMA(x,11,2) - SMA(x,4,2), x = V*((C-L)-(H-C))/(H-L) — volume/microstructure. GTJA
    SMA(x,n,m) is an EWM with alpha=m/n (adjust=False). A None x (H==L day) skips the update,
    carrying the previous EWM values."""
    out: list[float | None] = [None] * len(bars)
    e11: float | None = None
    e4: float | None = None
    for i, b in enumerate(bars):
        x = _safe_div(b.volume * ((b.close - b.low) - (b.high - b.close)), b.high - b.low)
        if x is not None:
            e11 = x if e11 is None else e11 + (2.0 / 11.0) * (x - e11)
            e4 = x if e4 is None else e4 + (2.0 / 4.0) * (x - e4)
        if e11 is not None and e4 is not None:
            out[i] = e11 - e4
    return out


def gtja_163(bars: Sequence[Bar]) -> list[float | None]:
    """rank((-ret) * MEAN(V,20) * VWAP * (HIGH-CLOSE)) — reversal×volume. VWAP = (O+H+L+C)/4
    (vibe-trading's equity_us fallback); rank applied by the evaluator."""
    volumes = [b.volume for b in bars]
    out: list[float | None] = [None] * len(bars)
    for i in range(1, len(bars)):
        mv = _roll_mean(volumes, 20, i)
        if mv is None or bars[i - 1].close <= _EPS:
            continue
        b = bars[i]
        ret = b.close / bars[i - 1].close - 1.0
        vwap = (b.open + b.high + b.low + b.close) / 4.0
        out[i] = (-ret) * mv * vwap * (b.high - b.close)
    return out


def gtja_171(bars: Sequence[Bar]) -> list[float | None]:
    """-1*((LOW-CLOSE)*(OPEN^5)) / ((CLOSE-HIGH)*(CLOSE^5)) — microstructure/range."""
    out: list[float | None] = [None] * len(bars)
    for i, b in enumerate(bars):
        out[i] = _safe_div(-((b.low - b.close) * b.open**5), (b.close - b.high) * b.close**5)
    return out


GTJA_SURVIVORS: dict[str, AlphaSeries] = {
    "gtja191_002": gtja_002,
    "gtja191_054": gtja_054,
    "gtja191_111": gtja_111,
    "gtja191_163": gtja_163,
    "gtja191_171": gtja_171,
}
