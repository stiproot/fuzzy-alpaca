from orchestrator.domain.ids import client_order_id


def test_short_id_passes_through() -> None:
    assert client_order_id("wf-123", "place") == "wf-123-place"


def test_deterministic() -> None:
    assert client_order_id("abc", "place") == client_order_id("abc", "place")


def test_over_long_id_is_stable_and_bounded() -> None:
    long_instance = "x" * 60
    first = client_order_id(long_instance, "place")
    second = client_order_id(long_instance, "place")
    assert first == second
    assert len(first) <= 48


def test_distinct_steps_differ() -> None:
    assert client_order_id("wf-1", "place") != client_order_id("wf-1", "close")
