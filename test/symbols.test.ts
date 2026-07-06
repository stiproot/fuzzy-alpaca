import { Either, Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  cryptoSymbolFromSlashless,
  SymbolFromPath,
} from "../src/domain/primitives.js"
import { CreateOrderRequest } from "../src/domain/schemas/order.js"

const decodePath = Schema.decodeUnknownEither(SymbolFromPath)
const encodePath = Schema.encodeSync(SymbolFromPath)

describe("SymbolFromPath", () => {
  it("plain equity tickers pass through", () => {
    expect(Either.getOrThrow(decodePath("AAPL"))).toBe("AAPL")
    expect(Either.getOrThrow(decodePath("BRK.B"))).toBe("BRK.B")
  })

  it("dashed equity tickers stay equities (suffix not a quote currency)", () => {
    expect(Either.getOrThrow(decodePath("BRK-B"))).toBe("BRK-B")
  })

  it("dash form with quote-currency suffix becomes a crypto pair", () => {
    expect(Either.getOrThrow(decodePath("BTC-USD"))).toBe("BTC/USD")
    expect(Either.getOrThrow(decodePath("SOL-USDT"))).toBe("SOL/USDT")
    expect(Either.getOrThrow(decodePath("ETH-BTC"))).toBe("ETH/BTC")
  })

  it("rejects garbage", () => {
    expect(Either.isLeft(decodePath("btc-usd"))).toBe(true)
    expect(Either.isLeft(decodePath("!!!"))).toBe(true)
  })

  it("encodes crypto back to the dash form", () => {
    const decoded = Either.getOrThrow(decodePath("BTC-USD"))
    expect(encodePath(decoded)).toBe("BTC-USD")
    expect(encodePath(Either.getOrThrow(decodePath("AAPL")))).toBe("AAPL")
  })
})

describe("cryptoSymbolFromSlashless", () => {
  it("normalizes known quote-currency suffixes, longest first", () => {
    expect(cryptoSymbolFromSlashless("BTCUSD")).toBe("BTC/USD")
    expect(cryptoSymbolFromSlashless("SOLUSDT")).toBe("SOL/USDT")
    expect(cryptoSymbolFromSlashless("AVAXUSDC")).toBe("AVAX/USDC")
    expect(cryptoSymbolFromSlashless("ETHBTC")).toBe("ETH/BTC")
  })

  it("returns undefined when no suffix matches", () => {
    expect(cryptoSymbolFromSlashless("AAPL")).toBeUndefined()
    expect(cryptoSymbolFromSlashless("USD")).toBeUndefined()
  })
})

const decodeOrder = Schema.decodeUnknownEither(CreateOrderRequest)

const cryptoOrder = (overrides: Record<string, unknown> = {}) => ({
  symbol: "BTC/USD",
  side: "buy",
  type: "market",
  timeInForce: "gtc",
  qty: "0.001",
  clientOrderId: "crypto-1",
  ...overrides,
})

describe("CreateOrderRequest crypto rules", () => {
  it("accepts market gtc and ioc, limit gtc, notional market", () => {
    expect(Either.isRight(decodeOrder(cryptoOrder()))).toBe(true)
    expect(Either.isRight(decodeOrder(cryptoOrder({ timeInForce: "ioc" })))).toBe(true)
    expect(
      Either.isRight(decodeOrder(cryptoOrder({ type: "limit", limitPrice: "50000" })))
    ).toBe(true)
    const { qty: _q, ...rest } = cryptoOrder()
    expect(Either.isRight(decodeOrder({ ...rest, notional: "10" }))).toBe(true)
  })

  it("rejects day/fok time in force", () => {
    expect(Either.isLeft(decodeOrder(cryptoOrder({ timeInForce: "day" })))).toBe(true)
    expect(Either.isLeft(decodeOrder(cryptoOrder({ timeInForce: "fok" })))).toBe(true)
  })

  it("rejects plain stop orders and extendedHours", () => {
    expect(
      Either.isLeft(decodeOrder(cryptoOrder({ type: "stop", stopPrice: "50000" })))
    ).toBe(true)
    expect(Either.isLeft(decodeOrder(cryptoOrder({ extendedHours: true })))).toBe(true)
  })

  it("still accepts equity day orders unchanged", () => {
    expect(
      Either.isRight(decodeOrder(cryptoOrder({ symbol: "AAPL", timeInForce: "day", qty: "1" })))
    ).toBe(true)
  })
})
