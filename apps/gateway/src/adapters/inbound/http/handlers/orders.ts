import { HttpApiBuilder } from "@effect/platform"
import { Effect } from "effect"
import { TradingService } from "../../../../application/trading/service.js"
import { Api } from "../api.js"

export const OrdersHandlers = HttpApiBuilder.group(Api, "orders", (handlers) =>
  handlers
    .handle("createOrder", ({ payload }) =>
      TradingService.pipe(Effect.flatMap((t) => t.placeOrder(payload)))
    )
    .handle("listOrders", ({ urlParams }) =>
      TradingService.pipe(Effect.flatMap((t) => t.listOrders(urlParams)))
    )
    .handle("getOrder", ({ path, urlParams }) =>
      TradingService.pipe(
        Effect.flatMap((t) => t.getOrderFlexible(path.orderId, urlParams.byClientOrderId === true))
      )
    )
    .handle("replaceOrder", ({ path, payload }) =>
      TradingService.pipe(Effect.flatMap((t) => t.replaceOrder(path.orderId, payload)))
    )
    .handle("cancelOrder", ({ path }) =>
      TradingService.pipe(Effect.flatMap((t) => t.cancelOrder(path.orderId)))
    )
    .handle("cancelAllOrders", ({ urlParams }) =>
      TradingService.pipe(Effect.flatMap((t) => t.cancelAllOrders(urlParams.confirm === true)))
    )
)
