"""Immutable domain models. Frozen — construction is the only mutation.

These mirror the gateway's wire contract at the shapes the orchestrator needs; the gateway's
OpenAPI is the source of truth. All models are frozen so domain/application stay side-effect free.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

TradingMode = Literal["paper", "live"]
OrderSide = Literal["buy", "sell"]
OrderType = Literal["market", "limit", "stop", "stop_limit"]
TimeInForce = Literal["day", "gtc", "ioc", "fok"]

# Terminal order statuses — polling stops here.
TERMINAL_STATUSES: frozenset[str] = frozenset(
    {"filled", "canceled", "expired", "rejected", "done_for_day", "replaced"}
)


class Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class PlaceOrder(Frozen):
    symbol: str
    side: OrderSide
    type: OrderType
    time_in_force: TimeInForce
    client_order_id: str
    qty: str | None = None
    notional: str | None = None
    limit_price: str | None = None
    stop_price: str | None = None


class Order(Frozen):
    order_id: str
    client_order_id: str
    symbol: str
    side: OrderSide
    status: str
    filled_qty: str
    idempotent_replay: bool
    trading_mode: TradingMode


class Account(Frozen):
    buying_power: str
    equity: str
    trading_mode: TradingMode


class GatewayError(Frozen):
    """The gateway's error envelope, as a typed value in the Result error channel."""

    code: str
    message: str
    retryable: bool
    status: int
