"""Pure trade-lifecycle decisions. No I/O — just functions over values, unit-testable in
isolation. The effectful orchestration (calling the gateway, sleeping) lives in the activities."""

from __future__ import annotations

from orchestrator.domain.models import TERMINAL_STATUSES

# Expanding poll backoff (seconds) — crypto market orders fill in seconds; the tail covers resting
# limits before the workflow parks them.
POLL_SCHEDULE_SECONDS: tuple[int, ...] = (1, 2, 3, 5, 8, 13)


def is_terminal(status: str) -> bool:
    return status in TERMINAL_STATUSES


def poll_delays(max_attempts: int | None = None) -> tuple[int, ...]:
    """The backoff sequence to poll a fill through, clamped to `max_attempts`."""
    if max_attempts is None:
        return POLL_SCHEDULE_SECONDS
    return POLL_SCHEDULE_SECONDS[:max_attempts]
