"""Gateway HTTP adapter — the effect edge. All httpx calls are caught and mapped into a Result;
no exception escapes into the pure core. Implements GatewayPort."""

from __future__ import annotations

import httpx
from returns.result import Failure, Result, Success

from orchestrator.domain.models import Account, GatewayError, Order, PlaceOrder, Whoami


def _transport_error(message: str) -> GatewayError:
    # A network/timeout failure before any HTTP response — retryable by nature.
    return GatewayError(code="Transport", message=message, retryable=True, status=0)


def _from_envelope(status: int, body: dict[str, object]) -> GatewayError:
    """Map the gateway's `{ error: { code, message, retryable } }` envelope to a typed value.
    Schema-invalid request bodies (the platform's 400) have no envelope — normalize those too."""
    err = body.get("error")
    if isinstance(err, dict):
        return GatewayError(
            code=str(err.get("code", "Unknown")),
            message=str(err.get("message", "")),
            retryable=bool(err.get("retryable", False)),
            status=status,
        )
    return GatewayError(code="BadRequest", message=str(body), retryable=False, status=status)


class GatewayClient:
    def __init__(self, base_url: str, api_key: str, timeout: float = 15.0) -> None:
        self._base = base_url.rstrip("/")
        self._headers = {"x-api-key": api_key}
        self._timeout = timeout

    async def _get(self, path: str) -> Result[dict[str, object], GatewayError]:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(f"{self._base}{path}", headers=self._headers)
        except httpx.HTTPError as exc:
            return Failure(_transport_error(f"GET {path}: {exc}"))
        return _parse(resp)

    async def _post(
        self, path: str, payload: dict[str, object]
    ) -> Result[dict[str, object], GatewayError]:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    f"{self._base}{path}", headers=self._headers, json=payload
                )
        except httpx.HTTPError as exc:
            return Failure(_transport_error(f"POST {path}: {exc}"))
        return _parse(resp)

    async def get_whoami(self) -> Result[Whoami, GatewayError]:
        return (await self._get("/v1/whoami")).map(
            lambda b: Whoami(
                authenticated=bool(b["authenticated"]),
                trading_mode=b["tradingMode"],  # type: ignore[arg-type]
            )
        )

    async def get_account(self) -> Result[Account, GatewayError]:
        return (await self._get("/v1/account")).map(
            lambda b: Account(
                buying_power=str(b["buyingPower"]),
                equity=str(b["equity"]),
            )
        )

    async def place_order(self, order: PlaceOrder) -> Result[Order, GatewayError]:
        payload = _order_payload(order)
        return (await self._post("/v1/orders", payload)).map(_to_order)

    async def get_order(self, order_id: str) -> Result[Order, GatewayError]:
        return (await self._get(f"/v1/orders/{order_id}")).map(_to_order)


def _parse(resp: httpx.Response) -> Result[dict[str, object], GatewayError]:
    try:
        body: dict[str, object] = resp.json() if resp.content else {}
    except ValueError:
        body = {}
    if resp.is_success:
        return Success(body)
    return Failure(_from_envelope(resp.status_code, body))


def _order_payload(order: PlaceOrder) -> dict[str, object]:
    # camelCase for the gateway; drop None fields so strict schemas accept it.
    raw: dict[str, object | None] = {
        "symbol": order.symbol,
        "side": order.side,
        "type": order.type,
        "timeInForce": order.time_in_force,
        "clientOrderId": order.client_order_id,
        "qty": order.qty,
        "notional": order.notional,
        "limitPrice": order.limit_price,
        "stopPrice": order.stop_price,
    }
    return {k: v for k, v in raw.items() if v is not None}


def _to_order(b: dict[str, object]) -> Order:
    return Order(
        order_id=str(b["orderId"]),
        client_order_id=str(b["clientOrderId"]),
        symbol=str(b["symbol"]),
        side=b["side"],  # type: ignore[arg-type]
        status=str(b["status"]),
        filled_qty=str(b["filledQty"]),
        idempotent_replay=bool(b.get("idempotentReplay", False)),
        trading_mode=b["tradingMode"],  # type: ignore[arg-type]
    )
