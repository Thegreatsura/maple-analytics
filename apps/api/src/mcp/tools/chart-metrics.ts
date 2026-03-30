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
import { QuerySpec, type MetricsFilters, type QuerySpec as QuerySpecType } from "@maple/query-engine"
import { formatQueryResult } from "../lib/format-query-result"

const chartMetricsSchema = Schema.Struct({
  kind: Schema.Literals(["timeseries", "breakdown"]).annotate({
    description: "Query type: timeseries for trends over time, breakdown for top-N ranking",
  }),
  metric_name: Schema.String.annotate({ description: "Metric name (use list_metrics to discover available metrics)" }),
  metric_type: Schema.String.annotate({ description: "Metric type: sum, gauge, histogram, or exponential_histogram" }),
  metric: optionalStringParam(
    "Aggregation to apply (default: avg). Options: avg, sum, min, max, count",
  ),
  group_by: optionalStringParam(
    "Grouping dimension (default: none for timeseries, service for breakdown). Options: service, attribute, none",
  ),
  start_time: optionalStringParam("Start time (YYYY-MM-DD HH:mm:ss). Defaults to 1 hour ago"),
  end_time: optionalStringParam("End time (YYYY-MM-DD HH:mm:ss). Defaults to now"),
  service_name: optionalStringParam("Filter by service name"),
  attribute_key: optionalStringParam("Attribute key for filtering or group_by=attribute"),
  attribute_value: optionalStringParam("Attribute value filter (requires attribute_key)"),
  bucket_seconds: optionalNumberParam("Bucket size in seconds (timeseries only, auto-computed if omitted)"),
  limit: optionalNumberParam("Max breakdown rows (breakdown only, default 10, max 100)"),
})

const chartMetricsDescription =
  "Generate timeseries or breakdown charts from custom metrics. " +
  "Requires metric_name and metric_type — use list_metrics to discover available metrics. " +
  "Aggregations: avg, sum, min, max, count. " +
  "Group by: service, attribute, or none."

const decodeQuerySpecSync = Schema.decodeUnknownSync(QuerySpec)

export function registerChartMetricsTool(server: McpToolRegistrar) {
  server.tool(
    "chart_metrics",
    chartMetricsDescription,
    chartMetricsSchema,
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

        const metricsAttributeFilters: Array<{ key: string; value?: string; mode: "equals" | "exists" }> = []
        if (params.group_by !== "attribute" && attributeKey) {
          metricsAttributeFilters.push({
            key: attributeKey,
            ...(attributeValue ? { value: attributeValue, mode: "equals" as const } : { mode: "exists" as const }),
          })
        }

        const filters: MetricsFilters = {
          metricName: params.metric_name,
          metricType: params.metric_type as MetricsFilters["metricType"],
          ...(params.service_name && { serviceName: params.service_name }),
          ...(params.group_by === "attribute" && attributeKey && { groupByAttributeKey: attributeKey }),
          ...(metricsAttributeFilters.length > 0 && { attributeFilters: metricsAttributeFilters }),
        }

        type AnySpec = Record<string, unknown>
        let rawSpec: QuerySpecType

        if (params.kind === "timeseries") {
          rawSpec = {
            kind: "timeseries",
            source: "metrics",
            metric: params.metric ?? "avg",
            groupBy: params.group_by ? [params.group_by] : ["none"],
            filters,
            ...(params.bucket_seconds && { bucketSeconds: params.bucket_seconds }),
          } as AnySpec as QuerySpecType
        } else {
          rawSpec = {
            kind: "breakdown",
            source: "metrics",
            metric: params.metric ?? "avg",
            groupBy: "service",
            filters,
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
          "chart_metrics",
          exit.value,
          "metrics",
          params.kind,
          params.metric,
          st,
          et,
          params.group_by,
        )
      }),
  )
}
