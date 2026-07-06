import { Context, Effect, Option } from "effect"
import type {
  AlpacaError,
  DuplicateClientOrderId,
  InsufficientBuyingPower,
  OrderNotCancelable,
  OrderNotFound,
  PdtRuleViolation,
  PositionNotFound,
} from "../domain/errors.js"
import type { AnySymbol, ClientOrderId, OrderId } from "../domain/primitives.js"
import type { Account } from "../domain/schemas/account.js"
import type { Asset } from "../domain/schemas/asset.js"
import type { Clock } from "../domain/schemas/clock.js"
import type { CreateOrderRequest, Order, ReplaceOrderRequest } from "../domain/schemas/order.js"
import type { AssetNotFound } from "../domain/errors.js"
import type { CalendarDay } from "../domain/schemas/calendar.js"
import type { BarsPage, Quote, Snapshot, Trade } from "../domain/schemas/market-data.js"
import type { Position } from "../domain/schemas/position.js"

export interface ClosePositionParams {
  readonly qty?: string | undefined
  readonly percentage?: string | undefined
}

export interface GetBarsParams {
  readonly timeframe: string
  readonly start?: string | undefined
  readonly end?: string | undefined
  readonly limit: number
  readonly adjustment?: string | undefined
  readonly pageToken?: string | undefined
}

export interface ListAssetsParams {
  readonly status?: "active" | "inactive" | undefined
}

export interface CalendarParams {
  readonly start?: string | undefined
  readonly end?: string | undefined
}

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
    readonly getAsset: (symbol: AnySymbol) => Effect.Effect<Option.Option<Asset>, AlpacaError>
    readonly getPositions: () => Effect.Effect<ReadonlyArray<Position>, AlpacaError>
    readonly getPosition: (
      symbol: AnySymbol
    ) => Effect.Effect<Option.Option<Position>, AlpacaError>
    // Mutation (submits a liquidation order): not blind-retried by the adapter.
    readonly closePosition: (
      symbol: AnySymbol,
      params: ClosePositionParams
    ) => Effect.Effect<
      Order,
      AlpacaError | PositionNotFound | InsufficientBuyingPower | PdtRuleViolation
    >
    readonly getLatestQuote: (
      symbol: AnySymbol
    ) => Effect.Effect<Quote, AlpacaError | AssetNotFound>
    readonly getLatestTrade: (
      symbol: AnySymbol
    ) => Effect.Effect<Trade, AlpacaError | AssetNotFound>
    readonly getSnapshot: (
      symbol: AnySymbol
    ) => Effect.Effect<Snapshot, AlpacaError | AssetNotFound>
    // Direct REST underneath — carries Alpaca's real next_page_token.
    readonly getBars: (
      symbol: AnySymbol,
      params: GetBarsParams
    ) => Effect.Effect<BarsPage, AlpacaError | AssetNotFound>
    readonly getAssets: (params: ListAssetsParams) => Effect.Effect<ReadonlyArray<Asset>, AlpacaError>
    readonly getCalendar: (
      params: CalendarParams
    ) => Effect.Effect<ReadonlyArray<CalendarDay>, AlpacaError>
  }
>() {}
