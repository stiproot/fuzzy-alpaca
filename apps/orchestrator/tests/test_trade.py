from orchestrator.application.trade import is_terminal, poll_delays


def test_is_terminal() -> None:
    assert is_terminal("filled")
    assert is_terminal("canceled")
    assert not is_terminal("accepted")
    assert not is_terminal("new")


def test_poll_delays_clamped() -> None:
    assert poll_delays(3) == (1, 2, 3)
    assert len(poll_delays()) >= 1
