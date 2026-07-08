# Experiments directory + strategy-research backlog

**Status: historical — completed 2026-07-08.** Never cite as current truth.

## Goal

Two deliverables, requested together:

1. **Restructure the experiment record.** `docs/experiments.md` (272 lines, 5 experiments) becomes
   a *log/index*; each experiment moves to its own file under `docs/experiments/`
   (`NNN-<slug>.md`). The index keeps the loop/gate preamble, a one-line-per-experiment table with
   links, and a "where we stand" summary. A `TEMPLATE.md` seeds future experiments.
2. **Strategy research.** Price-TA is exhausted (ceiling OOS Sharpe ≈ 0.43 diversified). Research
   richer-signal strategy families compatible with our constraints (Alpaca equities + long-only
   spot crypto, daily bars, retail latency, DeepSeek LLM available, walk-forward gate arbiter) and
   write a **prioritized hypothesis backlog** (`docs/experiments/backlog.md`): per candidate —
   evidence, realistic OOS Sharpe, data/integration build needed, and how it flows through the
   existing harness.

## Method

- Four parallel research agents: (a) cross-sectional equity factors, (b) LLM/news-sentiment
  signals, (c) event-driven/structural/relative-value effects, (d) crypto non-price signals +
  realism base rates. Synthesized into the backlog with honest decay/contamination caveats.
- Restructure preserves experiment content verbatim (it is the durable record); only the container
  changes. All inbound links (`README.md`, `.claude/conventions.md`, `CLAUDE.md`, orchestrator
  README, `sweep.py` comment) keep resolving because `docs/experiments.md` remains the entry point;
  wording updated where it described a single-file log.

## Progress

| Step | Status |
|---|---|
| Plan doc | done |
| Research agents launched (4) | done |
| Split experiments 001–005 into `docs/experiments/` | done |
| Rewrite `docs/experiments.md` as index/log | done |
| `TEMPLATE.md` for future experiments | done |
| Update inbound references (README, conventions, CLAUDE.md, orchestrator README) | done |
| Synthesize research → `docs/experiments/backlog.md` | done |
| Commit | done |

## Deltas from plan

- None material. Backlog placed under `docs/experiments/backlog.md` (not `docs/research/`) so the
  hypothesis queue lives next to the record it feeds.
