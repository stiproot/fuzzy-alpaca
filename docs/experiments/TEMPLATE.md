# Experiment NNN — <the falsifiable question, phrased so the gate can answer it>

| | |
|---|---|
| **Date** | YYYY-MM-DD |
| **Status** | proposed → running → passed / blocked / refuted / near-miss |
| **One-liner** | <the result in one sentence — filled in at the end> |
| **Prev / Next** | [NNN-1](...) / [NNN+1](...) or [backlog](backlog.md) |

**Hypothesis.** One falsifiable claim, changing **one variable** relative to the previous cycle.
Written *before* running anything, so the result can't be rationalized after the fact.

**Method.** Exactly what will run: configs × symbols × timeframes, through the shared harness
(`sweep.py` / `backtest.py` / `portfolio.py`) — never a bespoke one-off. Note any harness change
made first (and why it's a prerequisite, not a tweak).

**Result.** Numbers, in a table, including the failures. The gate's verdict per config.

**Conclusion.** What the result means — honest about multiple testing, generalization, and what
was refuted. A killed mirage is a result.

**Improve (done this cycle).** What lesson was folded back into the harness so the next cycle
can't repeat the mistake.

**Next hypothesis (cycle NNN+1).** The one question this result makes most valuable to ask next.

---

*On completion: add the row to the log table in [`../experiments.md`](../experiments.md), update
Status and the one-liner here, and link the next experiment when it exists.*
