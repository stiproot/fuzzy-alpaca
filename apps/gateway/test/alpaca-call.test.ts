import { expect, it } from "@effect/vitest"
import { Effect, Fiber, Option, TestClock } from "effect"
import { alpacaCall } from "../src/adapters/outbound/alpaca/live.js"
import { wireClockFixture } from "../src/adapters/outbound/alpaca/testing.js"
import { ClockFromWire } from "../src/domain/schemas/clock.js"

const reject = (status: number, data?: object, headers?: Record<string, string>) =>
  Promise.reject({ message: "Request failed", response: { status, data, headers } })

it.effect("decode drift → AlpacaContractError, no retry", () =>
  Effect.gen(function* () {
    let calls = 0
    const error = yield* alpacaCall(
      "getClock",
      () => {
        calls++
        return Promise.resolve({ nonsense: true })
      },
      ClockFromWire
    ).pipe(Effect.flip)
    expect(error._tag).toBe("AlpacaContractError")
    expect((error as any).op).toBe("getClock")
    expect((error as any).parseError).toContain("is missing")
    expect(calls).toBe(1)
  })
)

it.effect("422 business rejection never retries", () =>
  Effect.gen(function* () {
    let calls = 0
    const result = yield* alpacaCall(
      "createOrder",
      () => {
        calls++
        return reject(422, { code: 42210000, message: "invalid qty" })
      },
      ClockFromWire
    ).pipe(Effect.flip)
    expect(result._tag).toBe("ValidationError")
    expect(calls).toBe(1)
  })
)

it.effect("429-then-success honors Retry-After before succeeding", () =>
  Effect.gen(function* () {
    let calls = 0
    const fiber = yield* alpacaCall(
      "getClock",
      () => {
        calls++
        return calls === 1
          ? reject(429, {}, { "retry-after": "3" })
          : Promise.resolve(wireClockFixture)
      },
      ClockFromWire
    ).pipe(Effect.fork)

    // 1s in: still inside the mandatory 3s Retry-After pause
    yield* TestClock.adjust("1 second")
    expect(Option.isNone(yield* Fiber.poll(fiber))).toBe(true)

    // past Retry-After + backoff
    yield* TestClock.adjust("5 seconds")
    const clock = yield* Fiber.join(fiber)
    expect(clock.isOpen).toBe(true)
    expect(calls).toBe(2)
  })
)

it.effect("transient AlpacaUnavailable retries 3 times then fails", () =>
  Effect.gen(function* () {
    let calls = 0
    const fiber = yield* alpacaCall(
      "getAccount",
      () => {
        calls++
        return reject(502)
      },
      ClockFromWire
    ).pipe(Effect.flip, Effect.fork)

    for (let i = 0; i < 6; i++) {
      yield* TestClock.adjust("2 seconds")
    }
    const error = yield* Fiber.join(fiber)
    expect(error._tag).toBe("AlpacaUnavailable")
    expect(calls).toBe(4) // initial + 3 retries
  })
)
