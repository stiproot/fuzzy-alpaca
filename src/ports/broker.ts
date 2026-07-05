import { Context, Effect, Option } from "effect"
import type {
  AlpacaError,
  DuplicateClientOrderId,
  InsufficientBuyingPower,
  OrderNotCancelable,
  OrderNotFound,
  PdtRuleViolation,
} from "../domain/errors.js"
import type { ClientOrderId, OrderId, TickerSymbol } from "../domain/primitives.js"
import type { Account } from "../domain/schemas/account.js"
import type { Asset } from "../domain/schemas/asset.js"
import type { Clock } from "../domain/schemas/clock.js"
import type { CreateOrderRequest, Order, ReplaceOrderRequest } from "../domain/schemas/order.js"

export type CreateOrderError =
  | AlpacaError
  | InsufficientBuyingPower
  | PdtRuleViolation
  | DuplicateClientOrderId

export interface ListOrdersParams {
  readonly status: "open" | "closed" | "all"
  readonly symbols?: ReadonlyArray<string> | undefined
  readonly after?: string | undefined
  readonly until?: string | undefined
  readonly limit: number
  readonly direction: "asc" | "desc"
}

// The outbound (driven) broker port. The Alpaca SDK adapter implements it;
// tests provide an in-memory implementation. Every method returns decoded
// domain types, so loose SDK types can never escape the adapter.
export class AlpacaClient extends Context.Tag("AlpacaClient")<
  AlpacaClient,
  {
    readonly getAccount: () => Effect.Effect<Account, AlpacaError>
    readonly getClock: () => Effect.Effect<Clock, AlpacaError>
    // Never blind-retried by the adapter — ambiguity is reconciled by the
    // application layer via getOrderByClientOrderId.
    readonly createOrder: (params: CreateOrderRequest) => Effect.Effect<Order, CreateOrderError>
    readonly getOrder: (id: OrderId) => Effect.Effect<Order, AlpacaError | OrderNotFound>
    readonly getOrderByClientOrderId: (
      id: ClientOrderId
    ) => Effect.Effect<Option.Option<Order>, AlpacaError>
    readonly getOrders: (params: ListOrdersParams) => Effect.Effect<ReadonlyArray<Order>, AlpacaError>
    // Mutation like createOrder: not blind-retried by the adapter.
    readonly replaceOrder: (
      id: OrderId,
      params: ReplaceOrderRequest
    ) => Effect.Effect<
      Order,
      | AlpacaError
      | OrderNotFound
      | OrderNotCancelable
      | InsufficientBuyingPower
      | PdtRuleViolation
    >
    readonly cancelOrder: (
      id: OrderId
    ) => Effect.Effect<void, AlpacaError | OrderNotFound | OrderNotCancelable>
    readonly cancelAllOrders: () => Effect.Effect<
      ReadonlyArray<{ readonly orderId: string; readonly status: number }>,
      AlpacaError
    >
    readonly getAsset: (symbol: TickerSymbol) => Effect.Effect<Option.Option<Asset>, AlpacaError>
  }
>() {}
