"""Ports — the hexagonal boundary. Infrastructure adapters implement these; application and
activities depend only on the Protocols. Every method returns a Result: errors are values, not
exceptions, so the core never needs try/except."""

from __future__ import annotations

from typing import Protocol

from returns.result import Result

from orchestrator.domain.models import Account, GatewayError, Order, PlaceOrder


class GatewayPort(Protocol):
    async def get_account(self) -> Result[Account, GatewayError]: ...

    async def place_order(self, order: PlaceOrder) -> Result[Order, GatewayError]: ...

    async def get_order(self, order_id: str) -> Result[Order, GatewayError]: ...


class JournalPort(Protocol):
    """Persists the orders mirror + decisions. Keyed writes go through Dapr state; the record is
    a plain serializable dict at this boundary."""

    async def record_order(self, order: Order) -> Result[None, str]: ...
