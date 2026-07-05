import { HttpApiBuilder, HttpApiSwagger } from "@effect/platform"
import { Layer } from "effect"
import { TradingService } from "../../../application/trading/service.js"
import { AppConfig } from "../../../config.js"
import { Api } from "./api.js"
import { OrdersHandlers } from "./handlers/orders.js"
import { SystemHandlers } from "./handlers/system.js"
import { AuthorizationLive } from "./middleware/auth.js"
import { withRequestId } from "./middleware/requestId.js"

// Requires the AlpacaClient port — index.ts provides the SDK adapter,
// tests provide the in-memory one.
export const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(SystemHandlers),
  Layer.provide(OrdersHandlers),
  Layer.provide(TradingService.Default),
  Layer.provide(AuthorizationLive),
  Layer.provide(AppConfig.Default)
)

// Everything except the platform-specific server layer, so tests can provide
// NodeHttpServer.layerTest and production provides a real port.
export const HttpAppLive = HttpApiBuilder.serve(withRequestId).pipe(
  Layer.provide(HttpApiSwagger.layer({ path: "/docs" })),
  Layer.provide(ApiLive)
)
