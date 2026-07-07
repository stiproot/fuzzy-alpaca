import type { MetricPair } from "effect"

// Minimal Prometheus text exposition (version 0.0.4) over Effect's metric
// registry snapshot. Counters, gauges, and histograms cover everything this
// service records.

const sanitize = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

const labelString = (tags: ReadonlyArray<{ readonly key: string; readonly value: string }>, extra?: string) => {
  const parts = tags.map((t) => `${t.key}="${sanitize(t.value)}"`)
  if (extra !== undefined) parts.push(extra)
  return parts.length > 0 ? `{${parts.join(",")}}` : ""
}

export const formatPrometheus = (pairs: Iterable<MetricPair.MetricPair.Untyped>): string => {
  const lines: Array<string> = []
  const typed = new Set<string>()

  for (const pair of pairs) {
    const name = pair.metricKey.name.replace(/[^a-zA-Z0-9_:]/g, "_")
    const tags = pair.metricKey.tags
    const state = pair.metricState as unknown as Record<string, unknown>

    const declare = (type: string) => {
      if (!typed.has(name)) {
        typed.add(name)
        lines.push(`# TYPE ${name} ${type}`)
      }
    }

    if ("count" in state && "sum" in state && "buckets" in state) {
      // histogram (includes Metric.timerWithBoundaries)
      declare("histogram")
      for (const [le, count] of state["buckets"] as Iterable<readonly [number, number]>) {
        lines.push(`${name}_bucket${labelString(tags, `le="${le}"`)} ${count}`)
      }
      lines.push(`${name}_bucket${labelString(tags, 'le="+Inf"')} ${state["count"]}`)
      lines.push(`${name}_sum${labelString(tags)} ${state["sum"]}`)
      lines.push(`${name}_count${labelString(tags)} ${state["count"]}`)
    } else if ("count" in state) {
      declare("counter")
      lines.push(`${name}${labelString(tags)} ${state["count"]}`)
    } else if ("value" in state && typeof state["value"] === "number") {
      declare("gauge")
      lines.push(`${name}${labelString(tags)} ${state["value"]}`)
    }
  }

  return lines.join("\n") + "\n"
}
