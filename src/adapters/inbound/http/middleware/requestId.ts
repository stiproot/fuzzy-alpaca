import { HttpApp, HttpMiddleware, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Effect } from "effect"
import { randomUUID } from "node:crypto"

// Accept a caller-supplied x-request-id or mint one; echo it on the response,
// annotate all logs in the request scope, and wrap the request in a span.
// Defects (undeclared errors) are scrubbed into the InternalError envelope
// here so raw exceptions can never reach the wire.
export const withRequestId = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const requestId = request.headers["x-request-id"] ?? randomUUID()
    // The API builder can commit the response before this middleware regains
    // control, so the header must go through a pre-response handler.
    yield* HttpApp.appendPreResponseHandler((_req, response) =>
      Effect.succeed(HttpServerResponse.setHeader(response, "x-request-id", requestId))
    )
    const response = yield* app.pipe(
      Effect.catchAllDefect((defect) =>
        Effect.logError("unhandled defect", defect).pipe(
          Effect.as(
            HttpServerResponse.text(
              JSON.stringify({
                error: {
                  code: "InternalError",
                  message: "Internal server error",
                  retryable: false,
                  requestId,
                },
              }),
              { status: 500, contentType: "application/json" }
            )
          )
        )
      ),
      Effect.annotateLogs({ requestId }),
      Effect.withSpan("http.request", { attributes: { requestId } })
    )
    return response
  })
)
