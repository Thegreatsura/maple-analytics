import {
  optionalStringParam,
  type McpToolRegistrar,
} from "./types"
import { queryTinybird } from "../lib/query-tinybird"
import { getSpamPatternsParam } from "@/lib/spam-patterns"
import { resolveTimeRange } from "../lib/time"
import { formatPercent, formatDurationFromMs, formatNumber, formatTable } from "../lib/format"
import { Effect, Schema } from "effect"
import { createDualContent } from "../lib/structured-output"
import { formatNextSteps } from "../lib/next-steps"

export function registerComparePeriodsTool(server: McpToolRegistrar) {
  server.tool(
    "compare_periods",
    "Compare system health between two time periods to detect regressions. Defaults to comparing the last hour against the previous hour. Useful after deploys or incident reports.",
    Schema.Struct({
      current_start: optionalStringParam("Start of current period (YYYY-MM-DD HH:mm:ss). Defaults to 1 hour ago"),
      current_end: optionalStringParam("End of current period (YYYY-MM-DD HH:mm:ss). Defaults to now"),
      previous_start: optionalStringParam("Start of previous period. Defaults to 1 hour before current_start"),
      previous_end: optionalStringParam("End of previous period. Defaults to current_start"),
      service_name: optionalStringParam("Scope comparison to a specific service"),
    }),
    ({ current_start, current_end, previous_start, previous_end, service_name }) =>
      Effect.gen(function* () {
        // Resolve current period
        const current = resolveTimeRange(current_start, current_end, 1)

        // Resolve previous period: default to same duration before current
        // Calculate duration of current period for previous period default
        const currentStartDate = new Date(current.st.replace(" ", "T") + "Z")
        const currentEndDate = new Date(current.et.replace(" ", "T") + "Z")
        const durationMs = currentEndDate.getTime() - currentStartDate.getTime()

        const prevEndDefault = current.st
        const prevStartDefault = new Date(currentStartDate.getTime() - durationMs)
          .toISOString().replace("T", " ").slice(0, 19)

        const prevSt = previous_start ?? prevStartDefault
        const prevEt = previous_end ?? prevEndDefault

        // Query both periods in parallel
        const [currentSummary, previousSummary, currentServices, previousServices] =
          yield* Effect.all(
            [
              queryTinybird("errors_summary", {
                start_time: current.st,
                end_time: current.et,
                exclude_spam_patterns: getSpamPatternsParam(),
              }),
              queryTinybird("errors_summary", {
                start_time: prevSt,
                end_time: prevEt,
                exclude_spam_patterns: getSpamPatternsParam(),
              }),
              queryTinybird("service_overview", {
                start_time: current.st,
                end_time: current.et,
              }),
              queryTinybird("service_overview", {
                start_time: prevSt,
                end_time: prevEt,
              }),
            ],
            { concurrency: "unbounded" },
          )

        // Aggregate services for both periods
        function aggregateServices(data: typeof currentServices.data) {
          const map = new Map<string, {
            throughput: number
            errorCount: number
            p50: number
            p95: number
            totalWeight: number
          }>()
          for (const row of data) {
            if (service_name && row.serviceName !== service_name) continue
            const tp = Number(row.throughput)
            const existing = map.get(row.serviceName)
            if (existing) {
              existing.throughput += tp
              existing.errorCount += Number(row.errorCount)
              existing.p50 += row.p50LatencyMs * tp
              existing.p95 += row.p95LatencyMs * tp
              existing.totalWeight += tp
            } else {
              map.set(row.serviceName, {
                throughput: tp,
                errorCount: Number(row.errorCount),
                p50: row.p50LatencyMs * tp,
                p95: row.p95LatencyMs * tp,
                totalWeight: tp,
              })
            }
          }
          return map
        }

        const currentSvcMap = aggregateServices(currentServices.data)
        const previousSvcMap = aggregateServices(previousServices.data)

        const curSummary = currentSummary.data[0]
        const prevSummaryRow = previousSummary.data[0]

        // Format delta
        function formatDelta(current: number, previous: number): string {
          if (previous === 0) return current > 0 ? "+inf" : "—"
          const pctChange = ((current - previous) / previous) * 100
          const sign = pctChange >= 0 ? "+" : ""
          return `${sign}${pctChange.toFixed(1)}%`
        }

        const lines: string[] = [
          `## Period Comparison`,
          `Current: ${current.st} — ${current.et}`,
          `Previous: ${prevSt} — ${prevEt}`,
          ``,
        ]

        // Overall summary comparison
        const curErrors = curSummary ? Number(curSummary.totalErrors) : 0
        const prevErrors = prevSummaryRow ? Number(prevSummaryRow.totalErrors) : 0
        const curErrorRate = curSummary ? curSummary.errorRate : 0
        const prevErrorRate = prevSummaryRow ? prevSummaryRow.errorRate : 0
        const curSpans = curSummary ? Number(curSummary.totalSpans) : 0
        const prevSpans = prevSummaryRow ? Number(prevSummaryRow.totalSpans) : 0

        lines.push(`### Overall`)
        const overallHeaders = ["Metric", "Previous", "Current", "Change"]
        const overallRows = [
          ["Total spans", formatNumber(prevSpans), formatNumber(curSpans), formatDelta(curSpans, prevSpans)],
          ["Total errors", formatNumber(prevErrors), formatNumber(curErrors), formatDelta(curErrors, prevErrors)],
          ["Error rate", formatPercent(prevErrorRate), formatPercent(curErrorRate), formatDelta(curErrorRate, prevErrorRate)],
        ]
        lines.push(formatTable(overallHeaders, overallRows))

        // Per-service comparison
        const allServiceNames = new Set([...currentSvcMap.keys(), ...previousSvcMap.keys()])
        if (allServiceNames.size > 0) {
          lines.push(``, `### Per-Service`)
          const svcHeaders = ["Service", "Prev Throughput", "Curr Throughput", "Prev Error Rate", "Curr Error Rate", "Prev P95", "Curr P95", "Flags"]
          const svcRows: string[][] = []

          const regressions: string[] = []

          for (const name of allServiceNames) {
            const cur = currentSvcMap.get(name)
            const prev = previousSvcMap.get(name)

            const curTp = cur?.throughput ?? 0
            const prevTp = prev?.throughput ?? 0
            const curEr = cur && cur.throughput > 0 ? (cur.errorCount / cur.throughput) * 100 : 0
            const prevEr = prev && prev.throughput > 0 ? (prev.errorCount / prev.throughput) * 100 : 0
            const curP95 = cur && cur.totalWeight > 0 ? cur.p95 / cur.totalWeight : 0
            const prevP95 = prev && prev.totalWeight > 0 ? prev.p95 / prev.totalWeight : 0

            const flags: string[] = []
            if (prevEr > 0 && curEr / prevEr > 1.5) flags.push("error_rate_up")
            if (prevP95 > 0 && curP95 / prevP95 > 2) flags.push("latency_up")
            if (prevTp > 0 && curTp / prevTp < 0.5) flags.push("throughput_drop")

            if (flags.length > 0) regressions.push(name)

            svcRows.push([
              name,
              formatNumber(prevTp),
              formatNumber(curTp),
              formatPercent(prevEr),
              formatPercent(curEr),
              formatDurationFromMs(prevP95),
              formatDurationFromMs(curP95),
              flags.join(", ") || "—",
            ])
          }

          lines.push(formatTable(svcHeaders, svcRows))

          // Next steps
          const nextSteps: string[] = []
          for (const svc of regressions.slice(0, 3)) {
            nextSteps.push(`\`diagnose_service service_name="${svc}"\` — investigate regression`)
          }
          if (curErrorRate > prevErrorRate && curErrorRate > 1) {
            nextSteps.push('`find_errors` — categorize new errors')
          }
          if (nextSteps.length === 0) {
            nextSteps.push('`system_health` — see current system state')
          }
          lines.push(formatNextSteps(nextSteps))
        }

        return {
          content: createDualContent(lines.join("\n"), {
            tool: "compare_periods" as any,
            data: {
              currentPeriod: { start: current.st, end: current.et },
              previousPeriod: { start: prevSt, end: prevEt },
              overall: {
                current: { totalSpans: curSpans, totalErrors: curErrors, errorRate: curErrorRate },
                previous: { totalSpans: prevSpans, totalErrors: prevErrors, errorRate: prevErrorRate },
              },
              services: Array.from(allServiceNames).map((name) => {
                const cur = currentSvcMap.get(name)
                const prev = previousSvcMap.get(name)
                return {
                  name,
                  current: {
                    throughput: cur?.throughput ?? 0,
                    errorRate: cur && cur.throughput > 0 ? (cur.errorCount / cur.throughput) * 100 : 0,
                    p95Ms: cur && cur.totalWeight > 0 ? cur.p95 / cur.totalWeight : 0,
                  },
                  previous: {
                    throughput: prev?.throughput ?? 0,
                    errorRate: prev && prev.throughput > 0 ? (prev.errorCount / prev.throughput) * 100 : 0,
                    p95Ms: prev && prev.totalWeight > 0 ? prev.p95 / prev.totalWeight : 0,
                  },
                }
              }),
            },
          }),
        }
      }),
  )
}
