import { HttpApi, OpenApi } from "@effect/platform"
import { systemGroup } from "./groups/system.js"

export class Api extends HttpApi.make("fuzzy-alpaca-core")
  .add(systemGroup)
  .annotate(OpenApi.Title, "fuzzy-alpaca-core")
  .annotate(
    OpenApi.Description,
    "Trading API wrapping Alpaca for an agent workflow orchestrator. All endpoints except /health require an x-api-key header."
  ) {}
