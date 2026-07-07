import { OpenApi } from "@effect/platform"
import { writeFileSync } from "node:fs"
import { Api } from "../src/adapters/inbound/http/api.js"

const spec = OpenApi.fromApi(Api)
writeFileSync("openapi.json", JSON.stringify(spec, null, 2) + "\n")
console.log(`openapi.json written (${Object.keys(spec.paths ?? {}).length} paths)`)
