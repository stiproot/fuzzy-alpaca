import { Effect, Layer, Schema } from "effect"
import type { AlpacaError } from "../../../domain/errors.js"
import { AccountFromWire, type Account } from "../../../domain/schemas/account.js"
import { ClockFromWire, type Clock } from "../../../domain/schemas/clock.js"
import { AlpacaClient } from "../../../ports/broker.js"

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

export const accountFixture: Account = Schema.decodeUnknownSync(AccountFromWire)(wireAccountFixture)
export const clockFixture: Clock = Schema.decodeUnknownSync(ClockFromWire)(wireClockFixture)

export interface AlpacaClientTestOptions {
  readonly account?: Account
  readonly clock?: Clock
  readonly failAccount?: AlpacaError
  readonly failClock?: AlpacaError
}

// In-memory broker port implementation. Grows the minimal state each
// milestone's tests need (order book arrives with milestone 3).
export const AlpacaClientTest = (options: AlpacaClientTestOptions = {}) =>
  Layer.succeed(AlpacaClient, {
    getAccount: () =>
      options.failAccount !== undefined
        ? Effect.fail(options.failAccount)
        : Effect.succeed(options.account ?? accountFixture),
    getClock: () =>
      options.failClock !== undefined
        ? Effect.fail(options.failClock)
        : Effect.succeed(options.clock ?? clockFixture),
  })
