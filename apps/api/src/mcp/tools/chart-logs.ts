import {
  optionalNumberParam,
  optionalStringParam,
  type McpToolRegistrar,
  type McpToolResult,
} from "./types"
import { resolveTimeRange } from "../lib/time"
import { Cause, Effect, Exit, Option, Schema } from "effect"
import { resolveTenant } from "@/mcp/lib/query-tinybird"
import { QueryEngineService } from "@/services/QueryEngineService"
import { QuerySpec, type LogsFilters, type QuerySpec as QuerySpecType } from "@maple/query-engine"
import { formatQueryResult } from "../lib/format-query-result"

const chartLogsSchema = Schema.Struct({
  kind: Schema.Literals(["timeseries", "breakdown"]).annotate({
    description: "Query type: timeseries for trends over time, breakdown for top-N ranking",
  }),
  group_by: optionalStringParam(
    "Grouping dimension (default: none for timeseries, service for breakdown). Options: service, severity, none",
  ),
  start_time: optionalStringParam("Start time (YYYY-MM-DD HH:mm:ss). Defaults to 1 hour ago"),
  end_time: optionalStringParam("End time (YYYY-MM-DD HH:mm:ss). Defaults to now"),
  service_name: optionalStringParam("Filter by service name"),
  severity: optionalStringParam("Filter by severity (e.g. ERROR, WARN, INFO)"),
  bucket_seconds: optionalNumberParam("Bucket size in seconds (timeseries only, auto-computed if omitted)"),
  limit: optionalNumberParam("Max breakdown rows (breakdown only, default 10, max 100)"),
})

const chartLogsDescription =
  "Generate timeseries or breakdown charts from log data. " +
  "Metric is always count. " +
  "Group by: service, severity, or none."

const decodeQuerySpecSync = Schema.decodeUnknownSync(QuerySpec)

export function registerChartLogsTool(server: McpToolRegistrar) {
  server.tool(
    "chart_logs",
    chartLogsDescription,
    chartLogsSchema,
    (params) =>
      Effect.gen(function* () {
        const { st, et } = resolveTimeRange(params.start_time, params.end_time)

        const filters: LogsFilters = {
          ...(params.service_name && { serviceName: params.service_name }),
          ...(params.severity && { severity: params.severity }),
        }
        const hasFilters = Object.keys(filters).length > 0

        type AnySpec = Record<string, unknown>
        let rawSpec: QuerySpecType

        if (params.kind === "timeseries") {
          rawSpec = {
            kind: "timeseries",
            source: "logs",
            metric: "count",
            groupBy: params.group_by ? [params.group_by] : ["none"],
            ...(hasFilters && { filters }),
            ...(params.bucket_seconds && { bucketSeconds: params.bucket_seconds }),
          } as AnySpec as QuerySpecType
        } else {
          rawSpec = {
            kind: "breakdown",
            source: "logs",
            metric: "count",
            groupBy: params.group_by ?? "service",
            ...(hasFilters && { filters }),
            ...(params.limit && { limit: params.limit }),
          } as AnySpec as QuerySpecType
        }

        let decodedQuery: QuerySpecType
        try {
          decodedQuery = decodeQuerySpecSync(rawSpec)
        } catch (error) {
          return {
            isError: true,
            content: [{ type: "text", text: `Invalid query specification:\n${String(error)}` }],
          }
        }

        const tenant = yield* resolveTenant
        const queryEngine = yield* QueryEngineService
        const exit = yield* queryEngine.execute(tenant, {
          startTime: st,
          endTime: et,
          query: decodedQuery,
        }).pipe(Effect.exit)

        if (Exit.isFailure(exit)) {
          const failure = Option.getOrUndefined(Exit.findErrorOption(exit))
          if (failure && typeof failure === "object" && "_tag" in failure) {
            const tagged = failure as { _tag: string; message: string; details?: string[] }
            const details = tagged.details ? `\n${tagged.details.join("\n")}` : ""
            return {
              isError: true,
              content: [{ type: "text", text: `${tagged._tag}: ${tagged.message}${details}` }],
            }
          }

          return {
            isError: true,
            content: [{ type: "text", text: Cause.pretty(exit.cause) }],
          }
        }

        return formatQueryResult(
          "chart_logs",
          exit.value,
          "logs",
          params.kind,
          undefined, // logs always use count
          st,
          et,
          params.group_by,
        )
      }),
  )
}
