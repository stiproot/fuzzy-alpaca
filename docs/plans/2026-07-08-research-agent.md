# Phase C.5 — research-agent loop

A cheap LLM agent that, on a Dapr-cron tick, researches strategies through the Phase C MCP tools
and writes reasoned **proposals** — and, by construction, can never trade. Inspired by h's
`dapr-agent` (DeepSeek via an OpenAI-compatible endpoint + a ~100-line ReAct loop), but we copy the
*pattern*, not the service: the h agent's LLM adapter drags in the heavy `dapr-agents` PyPI package
and its `agent-server` carries an h-specific HTTP contract we don't need. We already own the tools
(the MCP surface) and the `mcp` SDK, so a thin loop against the plain `openai` + `mcp` SDKs is
smaller and cleaner.

## Progress

| Milestone | Status | Notes |
|---|---|---|
| 1. ReAct loop + LLM port + tests | ✅ done (2026-07-07) | stub-LLM loop tests (dispatch, error, max-turns) |
| 2. MCP tool registry + proposals persistence | ✅ done (2026-07-07) | SSE→OpenAI schemas; proposals table |
| 3. Cron trigger + service + live verify | ✅ done (2026-07-07) | cron fires /research-tick; loop e2e proven |

## Result

- **Loop wiring, end-to-end (no API key):** a scripted stub LLM drove the **real** MCP registry
  against the running trading-mcp — it saw `evaluate_gate` (and asserted no placement tool),
  called it, the registry dispatched to the real gate, and the returned verdict
  (`passed:false, OOS sharpe -1.01`) was folded into a proposal persisted as row #1. `AGENT
  VERIFY OK`.
- **Dapr cron trigger:** with a fast schedule, the `research-tick` `bindings.cron` component
  loaded in the sidecar and Dapr POSTed `/research-tick` on schedule → `200 OK` each tick
  (skipping cleanly with no key). Reverted to `@every 300s`.
- **Real DeepSeek call:** the one unverified piece — a config-only step (`LLM_API_KEY`). No key
  was available in this environment; the loop is provider-neutral and ready.

**Deltas from plan:** research-agent reuses the shared `Settings` (so it needs `SERVICE_API_KEY`
passed through even though it reaches the gateway only via MCP); the sidecar shares the app's
netns, so an app startup crash breaks the sidecar's DNS — bring the app up healthy first.
Verified with a stub because no DeepSeek key was present; a `LLM_API_KEY` turns on the real model
with no code change.

## Design

Same conventions: functional `Result`-typed core, effects at the edges, flat hex, uv. Runs as a
second entrypoint in the orchestrator image (reuses config/db), a `research-agent` compose service
with its own Dapr sidecar + cron binding.

- **LLM behind a port.** `LLMClient.generate(messages, tools) -> Result[LLMTurn, str]`. Real
  adapter: `AsyncOpenAI(base_url=DeepSeek, api_key=...)` (~15 lines, provider-neutral — swap the
  base URL for any OpenAI-compatible model). Test/verify: a scripted **stub** LLM, so the whole
  loop is verifiable with no API key.
- **ReAct loop** (`application/react.py`, pure over the ports): system+user → generate → if
  tool_calls, dispatch each via the tool registry and append results, repeat → else return the
  final message. Tracks the tool calls made (audit trail). No I/O of its own.
- **Tools = our MCP** (`ToolRegistry` port). The MCP registry connects to `trading-mcp` over SSE,
  maps MCP tool schemas → OpenAI tool specs, and dispatches `call_tool`. The surface has **no
  placement tool**, so the agent structurally cannot trade — the propose/execute boundary is
  enforced by the toolset, not by trust.
- **Output = a proposal**, written to a `proposals` table (final text + model + turns + the tool
  calls it made). The agent proposes; a human or a later gated step promotes. It never calls the
  workflow.
- **Loop = Dapr cron.** `bindings.cron` (`@every Ns`) → the sidecar POSTs `/research-tick` → run
  the research use case once (guarded by a lock so overlapping ticks no-op, per h's pattern).

## Milestones

1. **ReAct loop + LLM port + tests.** Domain (`ToolCall`, `LLMTurn`, `ReactResult`), ports, the
   loop, the DeepSeek adapter. Unit-test the loop with a stub LLM that calls a tool then answers —
   proving dispatch, message threading, and termination without a network. `ruff` + `mypy --strict`.
2. **MCP registry + proposals.** SSE tool bridge (schema map + dispatch), `proposals` table + repo,
   the research use case composing loop → tools → persist.
3. **Cron + service + live verify.** `agent_app.py` cron-tick route, `dapr/cron.yaml`, compose
   service + sidecar. Verify: a stub-LLM tick runs end-to-end (cron → loop → real MCP tools →
   proposal row); a real DeepSeek tick if `LLM_API_KEY` is set. Commit + push.

## Non-goals

No auto-promotion of proposals to live trades (a human/gated step does that — the boundary is the
point), no multi-agent debate, no fine-tuning. One agent, one prompt, cron-driven.
