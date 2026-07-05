import { Context, Effect } from "effect"
import type { AlpacaError } from "../domain/errors.js"
import type { Account } from "../domain/schemas/account.js"
import type { Clock } from "../domain/schemas/clock.js"

// The outbound (driven) broker port. The Alpaca SDK adapter implements it;
// tests provide an in-memory implementation. Every method returns decoded
// domain types, so loose SDK types can never escape the adapter.
export class AlpacaClient extends Context.Tag("AlpacaClient")<
  AlpacaClient,
  {
    readonly getAccount: () => Effect.Effect<Account, AlpacaError>
    readonly getClock: () => Effect.Effect<Clock, AlpacaError>
  }
>() {}
