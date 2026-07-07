from orchestrator.application.signals import STRATEGIES, momentum, sma_crossover
from orchestrator.domain.strategy import Bar


def _bars(closes: list[float]) -> list[Bar]:
    return [
        Bar(ts=f"t{i}", open=c, high=c, low=c, close=c, volume=1.0)
        for i, c in enumerate(closes)
    ]


def test_sma_crossover_needs_enough_bars() -> None:
    sig = sma_crossover(_bars([1.0] * 5), fast=3, slow=10)
    assert sig.action == "hold"
    assert "need" in sig.reason


def test_sma_crossover_uptrend_buys() -> None:
    # rising series → fast MA above slow MA
    sig = sma_crossover(_bars([float(i) for i in range(1, 41)]), fast=5, slow=20)
    assert sig.action == "buy"
    assert sig.strength > 0


def test_sma_crossover_downtrend_sells() -> None:
    sig = sma_crossover(_bars([float(i) for i in range(40, 0, -1)]), fast=5, slow=20)
    assert sig.action == "sell"


def test_momentum_positive_and_negative() -> None:
    up = momentum(_bars([float(i) for i in range(1, 30)]), lookback=10)
    assert up.action == "buy"
    down = momentum(_bars([float(i) for i in range(30, 1, -1)]), lookback=10)
    assert down.action == "sell"


def test_registry_exposes_strategies() -> None:
    assert set(STRATEGIES) == {"sma_crossover", "momentum"}
