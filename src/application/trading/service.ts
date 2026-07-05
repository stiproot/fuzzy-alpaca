import { Effect, Option } from "effect"
import { AlpacaClient } from "../../ports/broker.js"

export class TradingService extends Effect.Service<TradingService>()("TradingService", {
  effect: Effect.gen(function* () {
    const broker = yield* AlpacaClient

    return {
      getAccount: () => broker.getAccount(),
      getClock: () => broker.getClock(),
      // Fast health probe: 2s budget, never fails — degraded on any problem.
      connectivity: (): Effect.Effect<"ok" | "degraded"> =>
        broker.getClock().pipe(
          Effect.timeoutOption("2 seconds"),
          Effect.map((result) => (Option.isSome(result) ? ("ok" as const) : ("degraded" as const))),
          Effect.catchAll(() => Effect.succeed("degraded" as const))
        ),
    }
  }),
}) {}
