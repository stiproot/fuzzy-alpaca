import { HttpApiBuilder, HttpApiSwagger } from "@effect/platform"
import { Layer } from "effect"
import { AppConfig } from "../../../config.js"
import { Api } from "./api.js"
import { SystemHandlers } from "./handlers/system.js"
import { AuthorizationLive } from "./middleware/auth.js"
import { withRequestId } from "./middleware/requestId.js"

export const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(SystemHandlers),
  Layer.provide(AuthorizationLive),
  Layer.provide(AppConfig.Default)
)

// Everything except the platform-specific server layer, so tests can provide
// NodeHttpServer.layerTest and production provides a real port.
export const HttpAppLive = HttpApiBuilder.serve(withRequestId).pipe(
  Layer.provide(HttpApiSwagger.layer({ path: "/docs" })),
  Layer.provide(ApiLive)
)
