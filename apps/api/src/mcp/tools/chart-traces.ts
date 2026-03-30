import {
  optionalBooleanParam,
  optionalNumberParam,
  optionalStringParam,
  type McpToolRegistrar,
  type McpToolResult,
} from "./types"
import { resolveTimeRange } from "../lib/time"
import { Cause, Effect, Exit, Option, Schema } from "effect"
import { resolveTenant } from "@/mcp/lib/query-tinybird"
import { QueryEngineService } from "@/services/QueryEngineService"
import { QuerySpec, type TracesFilters, type QuerySpec as QuerySpecType } from "@maple/query-engine"
import { formatQueryResult } from "../lib/format-query-result"

const chartTracesSchema = Schema.Struct({
  kind: Schema.Literals(["timeseries", "breakdown"]).annotate({
    description: "Query type: timeseries for trends over time, breakdown for top-N ranking",
  }),
  metric: optionalStringParam(
    "Metric to compute (default: count). Options: count, avg_duration, p50_duration, p95_duration, p99_duration, error_rate",
  ),
  group_by: optionalStringParam(
    "Grouping dimension (default: none for timeseries, service for breakdown). Options: service, span_name, status_code, http_method, attribute, none",
  ),
  start_time: optionalStringParam("Start time (YYYY-MM-DD HH:mm:ss). Defaults to 1 hour ago"),
  end_time: optionalStringParam("End time (YYYY-MM-DD HH:mm:ss). Defaults to now"),
  service_name: optionalStringParam("Filter by service name"),
  span_name: optionalStringParam("Filter by span name"),
  root_spans_only: optionalBooleanParam("Only include root spans"),
  environments: optionalStringParam("Comma-separated environments to filter"),
  commit_shas: optionalStringParam("Comma-separated commit SHAs to filter"),
  attribute_key: optionalStringParam("Attribute key for filtering or group_by=attribute"),
  attribute_value: optionalStringParam("Attribute value filter (requires attribute_key)"),
  bucket_seconds: optionalNumberParam("Bucket size in seconds (timeseries only, auto-computed if omitted)"),
  limit: optionalNumberParam("Max breakdown rows (breakdown only, default 10, max 100)"),
})

const chartTracesDescription =
  "Generate timeseries or breakdown charts from trace data. " +
  "Metrics: count, avg_duration, p50_duration, p95_duration, p99_duration, error_rate. " +
  "Group by: service, span_name, status_code, http_method, attribute, or none. " +
  "Use explore_attributes to discover attribute keys for filtering."

const decodeQuerySpecSync = Schema.decodeUnknownSync(QuerySpec)

const splitCsv = (value: string): Array<string> =>
  value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0)

export function registerChartTracesTool(server: McpToolRegistrar) {
  server.tool(
    "chart_traces",
    chartTracesDescription,
    chartTracesSchema,
    (params) =>
      Effect.gen(function* () {
        const { st, et } = resolveTimeRange(params.start_time, params.end_time)

        const attributeKey = params.attribute_key
        const attributeValue = params.attribute_value

        if (attributeValue && !attributeKey) {
          return {
            isError: true,
            content: [{ type: "text", text: "`attribute_value` requires `attribute_key`." }],
          }
        }

        if (params.group_by === "attribute" && !attributeKey) {
          return {
            isError: true,
            content: [{ type: "text", text: "`group_by=attribute` requires `attribute_key`." }],
          }
        }

        const attributeFilters: Array<{ key: string; value?: string; mode: "equals" | "exists" }> = []
        if (attributeKey) {
          attributeFilters.push({
            key: attributeKey,
            ...(attributeValue ? { value: attributeValue, mode: "equals" as const } : { mode: "exists" as const }),
          })
        }

        const filters: TracesFilters = {
          ...(params.service_name && { serviceName: params.service_name }),
          ...(params.span_name && { spanName: params.span_name }),
          ...(params.root_spans_only && { rootSpansOnly: params.root_spans_only }),
          ...(params.environments && { environments: splitCsv(params.environments) }),
          ...(params.commit_shas && { commitShas: splitCsv(params.commit_shas) }),
          ...(attributeFilters.length > 0 && { attributeFilters }),
        }
        const hasFilters = Object.keys(filters).length > 0

        type AnySpec = Record<string, unknown>
        let rawSpec: QuerySpecType

        if (params.kind === "timeseries") {
          rawSpec = {
            kind: "timeseries",
            source: "traces",
            metric: params.metric ?? "count",
            groupBy: params.group_by ? [params.group_by] : ["none"],
            ...(hasFilters && { filters }),
            ...(params.bucket_seconds && { bucketSeconds: params.bucket_seconds }),
          } as AnySpec as QuerySpecType
        } else {
          rawSpec = {
            kind: "breakdown",
            source: "traces",
            metric: params.metric ?? "count",
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
          "chart_traces",
          exit.value,
          "traces",
          params.kind,
          params.metric,
          st,
          et,
          params.group_by,
        )
      }),
  )
}
