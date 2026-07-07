import { Effect, Metric } from "effect"

export const alpacaRequestsTotal = Metric.counter("alpaca_requests_total", {
  description: "Alpaca API calls by operation and outcome (per logical call, retries folded in)",
  incremental: true,
})

export const alpacaRequestDuration = Metric.timerWithBoundaries(
  "alpaca_request_duration_ms",
  [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
)

// Outermost stage of every broker call: one duration sample and one outcome
// count per logical call.
export const instrument =
  (op: string) =>
  <A, E extends { readonly _tag: string }, R>(
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R> =>
    effect.pipe(
      Metric.trackDuration(Metric.tagged(alpacaRequestDuration, "op", op)),
      Effect.tapBoth({
        onSuccess: () =>
          Metric.increment(
            Metric.tagged(Metric.tagged(alpacaRequestsTotal, "op", op), "outcome", "success")
          ),
        onFailure: (error) =>
          Metric.increment(
            Metric.tagged(Metric.tagged(alpacaRequestsTotal, "op", op), "outcome", error._tag)
          ),
      })
    )
