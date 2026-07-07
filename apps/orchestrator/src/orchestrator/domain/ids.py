"""Deterministic idempotency-key derivation — the crux of safe order placement.

A Dapr workflow instance id + a stable step name yield a `clientOrderId` that is identical across
activity replays, so the gateway replays the existing order instead of double-placing. Pure.
"""

from __future__ import annotations

import hashlib

# Gateway ClientOrderId brand accepts 1..48 chars.
_MAX_LEN = 48


def client_order_id(instance_id: str, step: str) -> str:
    """Stable, <=48-char key for (workflow instance, step).

    Deterministic in both branches: short ids pass through; over-long ids collapse to a stable
    hash so the same (instance_id, step) always maps to the same key.
    """
    raw = f"{instance_id}-{step}"
    if len(raw) <= _MAX_LEN:
        return raw
    digest = hashlib.sha1(raw.encode()).hexdigest()[:12]
    prefix = step[: _MAX_LEN - 1 - len(digest)]
    return f"{prefix}-{digest}"
