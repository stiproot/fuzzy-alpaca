import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { createServer } from "node:http"
import { AppConfig } from "./config.js"
import { HttpAppLive } from "./adapters/inbound/http/server.js"

const ServerLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* AppConfig
    yield* Effect.logInfo(`fuzzy-alpaca-core starting`, {
      port: config.port,
      tradingMode: config.tradingMode,
    })
    return NodeHttpServer.layer(() => createServer(), { port: config.port })
  })
).pipe(Layer.provide(AppConfig.Default))

NodeRuntime.runMain(Layer.launch(HttpAppLive.pipe(Layer.provide(ServerLive))))
