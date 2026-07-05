import { HttpApiBuilder } from "@effect/platform"
import { Effect } from "effect"
import { TradingService } from "../../../../application/trading/service.js"
import { Api } from "../api.js"

export const OrdersHandlers = HttpApiBuilder.group(Api, "orders", (handlers) =>
  handlers
    .handle("createOrder", ({ payload }) =>
      TradingService.pipe(Effect.flatMap((t) => t.placeOrder(payload)))
    )
    .handle("cancelOrder", ({ path }) =>
      TradingService.pipe(Effect.flatMap((t) => t.cancelOrder(path.orderId)))
    )
    .handle("cancelAllOrders", ({ urlParams }) =>
      TradingService.pipe(Effect.flatMap((t) => t.cancelAllOrders(urlParams.confirm === true)))
    )
)
