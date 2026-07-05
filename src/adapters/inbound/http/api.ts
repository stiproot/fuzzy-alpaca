import { HttpApi, OpenApi } from "@effect/platform"
import { ordersGroup } from "./groups/orders.js"
import { systemGroup } from "./groups/system.js"

export class Api extends HttpApi.make("fuzzy-alpaca-core")
  .add(systemGroup)
  .add(ordersGroup)
  .annotate(OpenApi.Title, "fuzzy-alpaca-core")
  .annotate(
    OpenApi.Description,
    "Trading API wrapping Alpaca for an agent workflow orchestrator. All endpoints except /health require an x-api-key header."
  ) {}
