import { Effect, Layer, Option, Ref, Schema } from "effect"
import {
  DuplicateClientOrderId,
  OrderNotCancelable,
  OrderNotFound,
  PositionNotFound,
  type AlpacaError,
} from "../../../domain/errors.js"
import { AccountFromWire, type Account } from "../../../domain/schemas/account.js"
import { AssetFromWire } from "../../../domain/schemas/asset.js"
import { ClockFromWire, type Clock } from "../../../domain/schemas/clock.js"
import {
  OrderFromWire,
  type CreateOrderRequest,
  type ReplaceOrderRequest,
} from "../../../domain/schemas/order.js"
import { cryptoSymbolFromSlashless } from "../../../domain/primitives.js"
import { CalendarDay } from "../../../domain/schemas/calendar.js"
import {
  BarFromWire,
  LatestQuoteFromWire,
  LatestTradeFromWire,
  SnapshotFromWire,
} from "../../../domain/schemas/market-data.js"
import { PositionFromWire } from "../../../domain/schemas/position.js"
import {
  AlpacaClient,
  type CalendarParams,
  type ClosePositionParams,
  type GetBarsParams,
  type ListAssetsParams,
  type ListOrdersParams,
} from "../../../ports/broker.js"

// Fixtures are captured real Alpaca paper-account JSON (sanitized), decoded
// through the same wire schemas production uses.
export const wireAccountFixture = {
  id: "9c22a5b6-0000-4000-8000-e63b1c2f8f4e",
  account_number: "PA3TESTFIXTURE",
  status: "ACTIVE",
  currency: "USD",
  buying_power: "200000",
  regt_buying_power: "200000",
  daytrading_buying_power: "0",
  cash: "100000",
  equity: "100000",
  last_equity: "100000",
  long_market_value: "0",
  short_market_value: "0",
  multiplier: "2",
  pattern_day_trader: false,
  daytrade_count: 0,
  shorting_enabled: true,
  trading_blocked: false,
  transfers_blocked: false,
  account_blocked: false,
  created_at: "2026-07-01T09:30:00.000000Z",
}

export const wireClockFixture = {
  timestamp: "2026-07-06T15:30:00.000000-04:00",
  is_open: true,
  next_open: "2026-07-07T09:30:00.000000-04:00",
  next_close: "2026-07-06T16:00:00.000000-04:00",
}

export const wireCryptoAssetFixture = {
  id: "276e2673-764b-4ab6-a611-caf665ca6340",
  class: "crypto",
  exchange: "ALPACA",
  symbol: "BTC/USD",
  status: "active",
  tradable: true,
  marginable: false,
  shortable: false,
  fractionable: true,
  easy_to_borrow: false,
  min_order_size: "0.0001",
  min_trade_increment: "0.0001",
  price_increment: "1",
}

// Position wire uses the slashless legacy symbology
export const wireCryptoPositionFixture = {
  asset_id: "276e2673-764b-4ab6-a611-caf665ca6340",
  symbol: "BTCUSD",
  exchange: "",
  asset_class: "crypto",
  side: "long",
  qty: "0.5",
  qty_available: "0.5",
  avg_entry_price: "60000",
  cost_basis: "30000",
  market_value: "31500",
  current_price: "63000",
  lastday_price: "62500",
  unrealized_pl: "1500",
  unrealized_plpc: "0.05",
  unrealized_intraday_pl: "250",
  unrealized_intraday_plpc: "0.008",
  change_today: "0.008",
}

const wireAssetDefaults = [
  wireCryptoAssetFixture,
  {
    id: "b0b6dd9d-8b9b-48a9-ba46-b9d54906e415",
    class: "us_equity",
    exchange: "NASDAQ",
    symbol: "AAPL",
    status: "active",
    tradable: true,
    marginable: true,
    shortable: true,
    fractionable: true,
    easy_to_borrow: true,
  },
  {
    id: "c0c6dd9d-8b9b-48a9-ba46-b9d54906e416",
    class: "us_equity",
    exchange: "NYSE",
    symbol: "HALT",
    status: "inactive",
    tradable: false,
    marginable: false,
    shortable: false,
    fractionable: false,
    easy_to_borrow: false,
  },
]

export const wirePositionFixture = {
  asset_id: "b0b6dd9d-8b9b-48a9-ba46-b9d54906e415",
  symbol: "AAPL",
  exchange: "NASDAQ",
  asset_class: "us_equity",
  side: "long",
  qty: "10",
  qty_available: "10",
  avg_entry_price: "150.00",
  cost_basis: "1500.00",
  market_value: "1550.00",
  current_price: "155.00",
  lastday_price: "154.50",
  unrealized_pl: "50.00",
  unrealized_plpc: "0.0333",
  unrealized_intraday_pl: "5.00",
  unrealized_intraday_plpc: "0.0032",
  change_today: "0.0032",
}

export const wireQuoteFixture = {
  symbol: "AAPL",
  quote: { t: "2026-07-02T19:59:59.999999Z", ax: "Q", ap: 189.65, as: 3, bx: "Q", bp: 189.6, bs: 2, c: ["R"], z: "C" },
}

export const wireTradeFixture = {
  symbol: "AAPL",
  trade: { t: "2026-07-02T19:59:58.123456Z", x: "Q", p: 189.62, s: 100, c: ["@"], i: 12345, z: "C" },
}

const wireBar = (day: number, close: number) => ({
  t: `2026-06-${String(day).padStart(2, "0")}T04:00:00Z`,
  o: close - 1,
  h: close + 1,
  l: close - 2,
  c: close,
  v: 1000000 + day,
  n: 5000,
  vw: close - 0.5,
})

// 5 daily bars for cursor tests
export const wireBarsFixture = [wireBar(22, 185), wireBar(23, 186), wireBar(24, 187), wireBar(25, 188), wireBar(26, 189)]

export const wireSnapshotFixture = {
  symbol: "AAPL",
  latestTrade: wireTradeFixture.trade,
  latestQuote: wireQuoteFixture.quote,
  minuteBar: wireBar(26, 189),
  dailyBar: wireBar(26, 189),
  prevDailyBar: wireBar(25, 188),
}

export const wireCalendarFixture = [
  { date: "2026-07-06", open: "09:30", close: "16:00", session_open: "0400", session_close: "2000" },
  { date: "2026-07-07", open: "09:30", close: "16:00", session_open: "0400", session_close: "2000" },
]

export const accountFixture: Account = Schema.decodeUnknownSync(AccountFromWire)(wireAccountFixture)
export const clockFixture: Clock = Schema.decodeUnknownSync(ClockFromWire)(wireClockFixture)

const FIXED_NOW = "2026-07-05T12:00:00.000000Z"

// Monotonic per-order timestamps so cursor pagination is exercisable.
const seqTimestamp = (seq: number) =>
  `2026-07-05T12:${String(Math.floor(seq / 60)).padStart(2, "0")}:${String(seq % 60).padStart(2, "0")}.000000Z`

type WireOrder = Record<string, unknown>

const makeWireOrder = (req: CreateOrderRequest, id: string, status: string): WireOrder => ({
  id,
  client_order_id: req.clientOrderId,
  symbol: req.symbol,
  side: req.side,
  type: req.type,
  time_in_force: req.timeInForce,
  status,
  qty: "qty" in req ? req.qty : null,
  notional: "notional" in req ? req.notional : null,
  filled_qty: status === "filled" ? ("qty" in req ? req.qty : "1") : "0",
  filled_avg_price: null,
  limit_price: req.limitPrice ?? null,
  stop_price: req.stopPrice ?? null,
  extended_hours: req.extendedHours ?? false,
  created_at: FIXED_NOW,
  submitted_at: FIXED_NOW,
  filled_at: null,
  canceled_at: null,
  expired_at: null,
  failed_at: null,
  replaces: null,
  replaced_by: null,
})

const OPEN_STATUSES = ["new", "accepted", "pending_new", "partially_filled"]

// Mirror the live adapter: crypto position wire symbols are slashless.
const canonicalWireSymbol = (wire: Record<string, unknown>): string =>
  wire["asset_class"] === "crypto"
    ? (cryptoSymbolFromSlashless(wire["symbol"] as string) ?? (wire["symbol"] as string))
    : (wire["symbol"] as string)

const normalizePosition = <P extends { readonly symbol: string; readonly assetClass: string }>(
  position: P
): P =>
  position.assetClass === "crypto"
    ? { ...position, symbol: cryptoSymbolFromSlashless(position.symbol) ?? position.symbol }
    : position

export interface AlpacaClientTestOptions {
  readonly account?: Account
  readonly clock?: Clock
  readonly failAccount?: AlpacaError
  readonly failClock?: AlpacaError
  /** status a freshly created order gets (default "accepted") */
  readonly onCreateStatus?: (req: CreateOrderRequest) => string
  /** fail createOrder with this error WITHOUT recording the order */
  readonly failCreate?: AlpacaError
  /** record the order, then fail the first createOrder with this error —
   * simulates "submitted but the response was lost" for reconciliation tests */
  readonly failCreateAfterSubmitOnce?: AlpacaError
  /** extra/overriding wire assets keyed by symbol */
  readonly assets?: ReadonlyArray<Record<string, unknown>>
  /** initial wire positions (default: one AAPL long of 10 shares) */
  readonly positions?: ReadonlyArray<Record<string, unknown>>
}

// In-memory broker implementing the port over a Ref'd wire-shaped order book;
// every read decodes through the production wire schemas.
export const AlpacaClientTest = (options: AlpacaClientTestOptions = {}) =>
  Layer.effect(
    AlpacaClient,
    Effect.gen(function* () {
      const orders = yield* Ref.make<ReadonlyArray<WireOrder>>([])
      const positions = yield* Ref.make<ReadonlyArray<Record<string, unknown>>>(
        options.positions ?? [wirePositionFixture]
      )
      const submitFailurePending = yield* Ref.make(options.failCreateAfterSubmitOnce !== undefined)
      let orderSeq = 0

      const assets = [...wireAssetDefaults, ...(options.assets ?? [])]

      const decodeOrder = Schema.decodeUnknown(OrderFromWire)

      const findWire = (predicate: (o: WireOrder) => boolean) =>
        Ref.get(orders).pipe(Effect.map((all) => Option.fromNullable(all.find(predicate))))

      const updateWire = (id: string, patch: Record<string, unknown>) =>
        Ref.update(orders, (all) => all.map((o) => (o["id"] === id ? { ...o, ...patch } : o)))

      const getOrder = (id: string) =>
        findWire((o) => o["id"] === id).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new OrderNotFound({ message: `order ${id} not found` })),
              onSome: (wire) => decodeOrder(wire).pipe(Effect.orDie),
            })
          )
        )

      return {
        getAccount: () =>
          options.failAccount !== undefined
            ? Effect.fail(options.failAccount)
            : Effect.succeed(options.account ?? accountFixture),
        getClock: () =>
          options.failClock !== undefined
            ? Effect.fail(options.failClock)
            : Effect.succeed(options.clock ?? clockFixture),

        createOrder: (req: CreateOrderRequest) =>
          Effect.gen(function* () {
            if (options.failCreate !== undefined) {
              return yield* Effect.fail(options.failCreate)
            }
            const existing = yield* findWire((o) => o["client_order_id"] === req.clientOrderId)
            if (Option.isSome(existing)) {
              return yield* Effect.fail(
                new DuplicateClientOrderId({
                  message: `clientOrderId ${req.clientOrderId} already exists`,
                })
              )
            }
            orderSeq += 1
            const id = `00000000-0000-4000-8000-${String(orderSeq).padStart(12, "0")}`
            const status = options.onCreateStatus?.(req) ?? "accepted"
            const timestamp = seqTimestamp(orderSeq)
            const wire = {
              ...makeWireOrder(req, id, status),
              created_at: timestamp,
              submitted_at: timestamp,
            }
            yield* Ref.update(orders, (all) => [...all, wire])
            const failPending = yield* Ref.getAndSet(submitFailurePending, false)
            if (failPending && options.failCreateAfterSubmitOnce !== undefined) {
              return yield* Effect.fail(options.failCreateAfterSubmitOnce)
            }
            return yield* decodeOrder(wire).pipe(Effect.orDie)
          }),

        getOrder,

        getOrders: (params: ListOrdersParams) =>
          Ref.get(orders).pipe(
            Effect.flatMap((all) => {
              const statusMatch = (o: WireOrder) => {
                const open = OPEN_STATUSES.includes(o["status"] as string)
                if (params.status === "all") return true
                if (params.status === "closed") return !open
                return open
              }
              const filtered = all
                .filter(statusMatch)
                .filter(
                  (o) =>
                    params.symbols === undefined ||
                    params.symbols.length === 0 ||
                    params.symbols.includes(o["symbol"] as string)
                )
                .filter(
                  (o) =>
                    params.after === undefined ||
                    Date.parse(o["created_at"] as string) > Date.parse(params.after)
                )
                .filter(
                  (o) =>
                    params.until === undefined ||
                    Date.parse(o["created_at"] as string) < Date.parse(params.until)
                )
                .sort((a, b) =>
                  params.direction === "asc"
                    ? Date.parse(a["created_at"] as string) - Date.parse(b["created_at"] as string)
                    : Date.parse(b["created_at"] as string) - Date.parse(a["created_at"] as string)
                )
                .slice(0, params.limit)
              return Effect.forEach(filtered, (wire) => decodeOrder(wire).pipe(Effect.orDie))
            })
          ),

        replaceOrder: (id: string, params: ReplaceOrderRequest) =>
          getOrder(id).pipe(
            Effect.flatMap((old) => {
              if (!OPEN_STATUSES.includes(old.status)) {
                return Effect.fail(
                  new OrderNotCancelable({ message: `order ${id} is ${old.status}, cannot replace` })
                )
              }
              orderSeq += 1
              const newId = `00000000-0000-4000-8000-${String(orderSeq).padStart(12, "0")}`
              const timestamp = seqTimestamp(orderSeq)
              return Ref.get(orders).pipe(
                Effect.flatMap((all) => {
                  const oldWire = all.find((o) => o["id"] === id)!
                  const newWire: WireOrder = {
                    ...oldWire,
                    id: newId,
                    client_order_id: params.clientOrderId ?? `replace-${orderSeq}`,
                    status: "accepted",
                    created_at: timestamp,
                    submitted_at: timestamp,
                    replaces: id,
                    replaced_by: null,
                    ...(params.qty !== undefined ? { qty: params.qty } : {}),
                    ...(params.timeInForce !== undefined ? { time_in_force: params.timeInForce } : {}),
                    ...(params.limitPrice !== undefined ? { limit_price: params.limitPrice } : {}),
                    ...(params.stopPrice !== undefined ? { stop_price: params.stopPrice } : {}),
                  }
                  return Ref.update(orders, (current) => [
                    ...current.map((o) =>
                      o["id"] === id ? { ...o, status: "replaced", replaced_by: newId } : o
                    ),
                    newWire,
                  ]).pipe(Effect.andThen(decodeOrder(newWire).pipe(Effect.orDie)))
                })
              )
            })
          ),

        getOrderByClientOrderId: (clientOrderId: string) =>
          findWire((o) => o["client_order_id"] === clientOrderId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.succeed(Option.none()),
                onSome: (wire) => decodeOrder(wire).pipe(Effect.orDie, Effect.map(Option.some)),
              })
            )
          ),

        cancelOrder: (id: string) =>
          getOrder(id).pipe(
            Effect.flatMap((order) =>
              OPEN_STATUSES.includes(order.status)
                ? updateWire(id, { status: "canceled", canceled_at: FIXED_NOW })
                : Effect.fail(
                    new OrderNotCancelable({ message: `order ${id} is ${order.status}` })
                  )
            )
          ),

        cancelAllOrders: () =>
          Ref.get(orders).pipe(
            Effect.flatMap((all) => {
              const open = all.filter((o) => OPEN_STATUSES.includes(o["status"] as string))
              return Ref.update(orders, (current) =>
                current.map((o) =>
                  OPEN_STATUSES.includes(o["status"] as string)
                    ? { ...o, status: "canceled", canceled_at: FIXED_NOW }
                    : o
                )
              ).pipe(
                Effect.as(open.map((o) => ({ orderId: o["id"] as string, status: 200 })))
              )
            })
          ),

        getAsset: (symbol: string) => {
          const wire = assets.find((a) => a["symbol"] === symbol)
          return wire === undefined
            ? Effect.succeed(Option.none())
            : Schema.decodeUnknown(AssetFromWire)(wire).pipe(Effect.orDie, Effect.map(Option.some))
        },

        getLatestQuote: (symbol: string) =>
          Schema.decodeUnknown(LatestQuoteFromWire)({ ...wireQuoteFixture, symbol }).pipe(
            Effect.orDie,
            Effect.map((wire) => ({ symbol: wire.symbol, ...wire.quote }))
          ),

        getLatestTrade: (symbol: string) =>
          Schema.decodeUnknown(LatestTradeFromWire)({ ...wireTradeFixture, symbol }).pipe(
            Effect.orDie,
            Effect.map((wire) => ({ symbol: wire.symbol, ...wire.trade }))
          ),

        getSnapshot: (symbol: string) =>
          Schema.decodeUnknown(SnapshotFromWire)({ ...wireSnapshotFixture, symbol }).pipe(
            Effect.orDie
          ),

        // Emulates Alpaca's real token pagination: token is an offset cursor.
        getBars: (symbol: string, params: GetBarsParams) =>
          Effect.gen(function* () {
            const offset = params.pageToken !== undefined ? Number(params.pageToken) : 0
            const page = wireBarsFixture.slice(offset, offset + params.limit)
            const next = offset + params.limit
            const items = yield* Effect.forEach(page, (bar) =>
              Schema.decodeUnknown(BarFromWire)(bar).pipe(Effect.orDie)
            )
            return {
              symbol: symbol as never,
              items,
              ...(next < wireBarsFixture.length ? { nextPageToken: String(next) } : {}),
            }
          }),

        getAssets: (_params: ListAssetsParams) =>
          Effect.forEach(assets, (wire) =>
            Schema.decodeUnknown(AssetFromWire)(wire).pipe(Effect.orDie)
          ),

        getCalendar: (_params: CalendarParams) =>
          Effect.forEach(wireCalendarFixture, (wire) =>
            Schema.decodeUnknown(CalendarDay)(wire).pipe(Effect.orDie)
          ),

        getPositions: () =>
          Ref.get(positions).pipe(
            Effect.flatMap((all) =>
              Effect.forEach(all, (wire) =>
                Schema.decodeUnknown(PositionFromWire)(wire).pipe(
                  Effect.orDie,
                  Effect.map(normalizePosition)
                )
              )
            )
          ),

        getPosition: (symbol: string) =>
          Ref.get(positions).pipe(
            Effect.flatMap((all) => {
              const wire = all.find((p) => canonicalWireSymbol(p) === symbol)
              return wire === undefined
                ? Effect.succeed(Option.none())
                : Schema.decodeUnknown(PositionFromWire)(wire).pipe(
                    Effect.orDie,
                    Effect.map(normalizePosition),
                    Effect.map(Option.some)
                  )
            })
          ),

        closePosition: (symbol: string, params: ClosePositionParams) =>
          Ref.get(positions).pipe(
            Effect.flatMap((all) => {
              const wire = all.find((p) => canonicalWireSymbol(p) === symbol)
              if (wire === undefined) {
                return Effect.fail(
                  new PositionNotFound({ message: `no open position in ${symbol}` })
                )
              }
              const held = Number(wire["qty"] as string)
              const closeQty =
                params.qty !== undefined
                  ? Number(params.qty)
                  : params.percentage !== undefined
                    ? (held * Number(params.percentage)) / 100
                    : held
              const remaining = held - closeQty

              orderSeq += 1
              const id = `00000000-0000-4000-8000-${String(orderSeq).padStart(12, "0")}`
              const timestamp = seqTimestamp(orderSeq)
              const liquidation: WireOrder = {
                id,
                client_order_id: `liquidation-${orderSeq}`,
                symbol,
                side: wire["side"] === "long" ? "sell" : "buy",
                type: "market",
                time_in_force: "day",
                status: "accepted",
                qty: String(closeQty),
                notional: null,
                filled_qty: "0",
                filled_avg_price: null,
                limit_price: null,
                stop_price: null,
                extended_hours: false,
                created_at: timestamp,
                submitted_at: timestamp,
                filled_at: null,
                canceled_at: null,
                expired_at: null,
                failed_at: null,
                replaces: null,
                replaced_by: null,
              }
              return Ref.update(orders, (current) => [...current, liquidation]).pipe(
                Effect.andThen(
                  Ref.update(positions, (current) =>
                    remaining <= 0
                      ? current.filter((p) => canonicalWireSymbol(p) !== symbol)
                      : current.map((p) =>
                          canonicalWireSymbol(p) === symbol
                            ? { ...p, qty: String(remaining), qty_available: String(remaining) }
                            : p
                        )
                  )
                ),
                Effect.andThen(decodeOrder(liquidation).pipe(Effect.orDie))
              )
            })
          ),
      }
    })
  )
