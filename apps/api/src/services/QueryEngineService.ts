import {
  type QueryEngineExecuteRequest,
  type QueryEngineExecuteResponse,
  type QuerySpec,
  type TimeseriesPoint,
} from "@maple/domain"
import {
  QueryEngineExecutionError,
  QueryEngineValidationError,
  TinybirdQueryError,
} from "@maple/domain/http"
import { Effect } from "effect"
import type { TenantContext } from "./AuthService"
import { TinybirdService } from "./TinybirdService"

interface TimeRangeBounds {
  readonly startMs: number
  readonly endMs: number
  readonly rangeSeconds: number
}

interface BucketFillOptions {
  readonly startMs: number
  readonly endMs: number
  readonly bucketSeconds: number
}

const MAX_RANGE_SECONDS = 60 * 60 * 24 * 31
const MAX_TIMESERIES_POINTS = 1_500

const toEpochMs = (value: string): number => new Date(value.replace(" ", "T") + "Z").getTime()
const TINYBIRD_DATETIME_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?$/

const computeBucketSeconds = (startMs: number, endMs: number): number => {
  const targetPoints = 40
  const rangeSeconds = Math.max((endMs - startMs) / 1000, 1)
  const raw = Math.ceil(rangeSeconds / targetPoints)
  if (raw <= 60) return 60
  if (raw <= 300) return 300
  if (raw <= 900) return 900
  if (raw <= 3600) return 3600
  if (raw <= 14400) return 14400
  return 86400
}

const floorToBucketMs = (epochMs: number, bucketSeconds: number): number => {
  const bucketMs = bucketSeconds * 1000
  return Math.floor(epochMs / bucketMs) * bucketMs
}

const buildBucketTimeline = (
  startMs: number,
  endMs: number,
  bucketSeconds: number,
): string[] => {
  const bucketMs = bucketSeconds * 1000
  const firstBucketMs = floorToBucketMs(startMs, bucketSeconds)
  const lastBucketMs = floorToBucketMs(endMs, bucketSeconds)
  const timeline: string[] = []

  for (let bucketMsCursor = firstBucketMs; bucketMsCursor <= lastBucketMs; bucketMsCursor += bucketMs) {
    timeline.push(new Date(bucketMsCursor).toISOString())
  }

  return timeline
}

const normalizeBucket = (bucket: string | Date): string => {
  if (bucket instanceof Date) {
    return bucket.toISOString()
  }

  const raw = String(bucket).trim()
  if (!raw) {
    return raw
  }

  const tinybirdDateTimeMatch = raw.match(TINYBIRD_DATETIME_RE)
  if (tinybirdDateTimeMatch) {
    const [, datePart, timePart, fractional = ""] = tinybirdDateTimeMatch
    const normalized = new Date(`${datePart}T${timePart}${fractional}Z`)
    if (!Number.isNaN(normalized.getTime())) {
      return normalized.toISOString()
    }
  }

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString()
  }

  return raw
}

const validateTimeRange = Effect.fn("QueryEngineService.validateTimeRange")(function* (
  request: QueryEngineExecuteRequest,
): Effect.fn.Return<TimeRangeBounds, QueryEngineValidationError> {
  const startMs = toEpochMs(request.startTime)
  const endMs = toEpochMs(request.endTime)

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return yield* new QueryEngineValidationError({
      message: "Invalid time range",
      details: ["startTime and endTime must be valid datetime strings"],
    })
  }

  if (endMs <= startMs) {
    return yield* new QueryEngineValidationError({
      message: "Invalid time range",
      details: ["endTime must be greater than startTime"],
    })
  }

  const rangeSeconds = (endMs - startMs) / 1000
  if (rangeSeconds > MAX_RANGE_SECONDS) {
    return yield* new QueryEngineValidationError({
      message: "Time range too large",
      details: [`Maximum supported range is ${MAX_RANGE_SECONDS} seconds`],
    })
  }

  return {
    startMs,
    endMs,
    rangeSeconds,
  }
})

const validateTraceAttributeFilters = Effect.fn("QueryEngineService.validateTraceAttributeFilters")(function* (
  query: QuerySpec,
): Effect.fn.Return<void, QueryEngineValidationError> {
  if (query.source !== "traces") return

  const details: string[] = []
  if (query.groupBy === "attribute" && !query.filters?.attributeKey) {
    details.push("groupBy=attribute requires filters.attributeKey")
  }
  if (!query.filters?.attributeKey && query.filters?.attributeValue) {
    details.push("filters.attributeValue requires filters.attributeKey")
  }

  if (details.length > 0) {
    return yield* new QueryEngineValidationError({
      message: "Invalid traces attribute filters",
      details,
    })
  }
})

const validatePointBudget = Effect.fn("QueryEngineService.validatePointBudget")(function* (
  request: QueryEngineExecuteRequest,
  range: TimeRangeBounds,
): Effect.fn.Return<void, QueryEngineValidationError> {
  if (request.query.kind !== "timeseries") return
  const bucketSeconds = request.query.bucketSeconds ?? computeBucketSeconds(range.startMs, range.endMs)
  const pointCount = Math.ceil(range.rangeSeconds / bucketSeconds)
  if (pointCount <= MAX_TIMESERIES_POINTS) return

  return yield* new QueryEngineValidationError({
    message: "Timeseries query too expensive",
    details: [
      `Requested ${pointCount} points, maximum is ${MAX_TIMESERIES_POINTS}`,
      "Increase bucketSeconds or reduce the time range",
    ],
  })
})

function groupTimeSeriesRows<T extends { bucket: string | Date; groupName: string }>(
  rows: ReadonlyArray<T>,
  valueExtractor: (row: T) => number,
  fillOptions?: BucketFillOptions,
): Array<TimeseriesPoint> {
  const bucketMap = new Map<string, Record<string, number>>()
  const bucketOrder: string[] = fillOptions
    ? buildBucketTimeline(fillOptions.startMs, fillOptions.endMs, fillOptions.bucketSeconds)
    : []

  for (const row of rows) {
    const bucket = normalizeBucket(row.bucket)
    if (!bucketMap.has(bucket)) {
      bucketMap.set(bucket, {})
      if (!fillOptions) {
        bucketOrder.push(bucket)
      }
    }
    bucketMap.get(bucket)![row.groupName] = valueExtractor(row)
  }

  if (fillOptions) {
    for (const bucket of bucketOrder) {
      if (!bucketMap.has(bucket)) {
        bucketMap.set(bucket, {})
      }
    }
  }

  return bucketOrder.map((bucket) => ({
    bucket,
    series: bucketMap.get(bucket)!,
  }))
}

const validate = Effect.fn("QueryEngineService.validate")(function* (
  request: QueryEngineExecuteRequest,
): Effect.fn.Return<TimeRangeBounds, QueryEngineValidationError> {
  const range = yield* validateTimeRange(request)
  yield* validateTraceAttributeFilters(request.query)
  yield* validatePointBudget(request, range)
  return range
})

const mapTinybirdError = <A, R>(
  effect: Effect.Effect<A, TinybirdQueryError, R>,
  context: string,
): Effect.Effect<A, QueryEngineExecutionError, R> =>
  effect.pipe(
    Effect.catchTag("TinybirdQueryError", (error: TinybirdQueryError) =>
      Effect.fail(
        new QueryEngineExecutionError({
          message: `${context}: ${error.message}`,
          causeTag: error._tag,
          pipe: error.pipe,
        }),
      ),
    ),
  )

type QueryEngineTinybird = Pick<
  TinybirdService,
  | "customTracesTimeseriesQuery"
  | "customLogsTimeseriesQuery"
  | "metricTimeSeriesSumQuery"
  | "metricTimeSeriesGaugeQuery"
  | "metricTimeSeriesHistogramQuery"
  | "metricTimeSeriesExpHistogramQuery"
  | "customTracesBreakdownQuery"
  | "customLogsBreakdownQuery"
  | "customMetricsBreakdownQuery"
>

export const makeQueryEngineExecute = (tinybird: QueryEngineTinybird) =>
  Effect.fn("QueryEngineService.execute")(function* (
    tenant: TenantContext,
    request: QueryEngineExecuteRequest,
  ): Effect.fn.Return<
    QueryEngineExecuteResponse,
    QueryEngineValidationError | QueryEngineExecutionError
  > {
    const range = yield* validate(request)
    const bucketSeconds = request.query.kind === "timeseries"
      ? request.query.bucketSeconds ?? computeBucketSeconds(range.startMs, range.endMs)
      : undefined
    const fillOptions = bucketSeconds
      ? {
          startMs: range.startMs,
          endMs: range.endMs,
          bucketSeconds,
        }
      : undefined

    if (request.query.source === "traces" && request.query.kind === "timeseries") {
      const result = yield* mapTinybirdError(
        tinybird.customTracesTimeseriesQuery(tenant, {
          start_time: request.startTime,
          end_time: request.endTime,
          bucket_seconds: bucketSeconds,
          service_name: request.query.filters?.serviceName,
          span_name: request.query.filters?.spanName,
          root_only: request.query.filters?.rootSpansOnly ? "1" : undefined,
          environments: request.query.filters?.environments?.join(","),
          commit_shas: request.query.filters?.commitShas?.join(","),
          group_by_service: request.query.groupBy === "service" ? "1" : undefined,
          group_by_span_name: request.query.groupBy === "span_name" ? "1" : undefined,
          group_by_status_code: request.query.groupBy === "status_code" ? "1" : undefined,
          group_by_attribute:
            request.query.groupBy === "attribute"
              ? request.query.filters?.attributeKey
              : undefined,
          attribute_filter_key: request.query.filters?.attributeKey,
          attribute_filter_value: request.query.filters?.attributeValue,
          resource_filter_key: request.query.filters?.resourceAttributeKey,
          resource_filter_value: request.query.filters?.resourceAttributeValue,
        }),
        "Failed to execute traces timeseries query",
      )

      const fieldMap = {
        count: "count",
        avg_duration: "avgDuration",
        p50_duration: "p50Duration",
        p95_duration: "p95Duration",
        p99_duration: "p99Duration",
        error_rate: "errorRate",
      } as const
      const field = fieldMap[request.query.metric]

      return {
        result: {
          kind: "timeseries",
          source: "traces",
          data: groupTimeSeriesRows(result, (row) => Number(row[field]), fillOptions),
        },
      }
    }

    if (request.query.source === "logs" && request.query.kind === "timeseries") {
      const result = yield* mapTinybirdError(
        tinybird.customLogsTimeseriesQuery(tenant, {
          start_time: request.startTime,
          end_time: request.endTime,
          bucket_seconds: bucketSeconds,
          service_name: request.query.filters?.serviceName,
          severity: request.query.filters?.severity,
          group_by_service: request.query.groupBy === "service" ? "1" : undefined,
          group_by_severity: request.query.groupBy === "severity" ? "1" : undefined,
        }),
        "Failed to execute logs timeseries query",
      )

      return {
        result: {
          kind: "timeseries",
          source: "logs",
          data: groupTimeSeriesRows(result, (row) => Number(row.count), fillOptions),
        },
      }
    }

    if (request.query.source === "metrics" && request.query.kind === "timeseries") {
      const params = {
        metric_name: request.query.filters.metricName,
        service: request.query.filters.serviceName,
        start_time: request.startTime,
        end_time: request.endTime,
        bucket_seconds: bucketSeconds,
      }

      const result = yield* mapTinybirdError(
        request.query.filters.metricType === "sum"
          ? tinybird.metricTimeSeriesSumQuery(tenant, params)
          : request.query.filters.metricType === "gauge"
            ? tinybird.metricTimeSeriesGaugeQuery(tenant, params)
            : request.query.filters.metricType === "histogram"
              ? tinybird.metricTimeSeriesHistogramQuery(tenant, params)
              : tinybird.metricTimeSeriesExpHistogramQuery(tenant, params),
        "Failed to execute metrics timeseries query",
      )

      const metricValueField = {
        avg: "avgValue",
        sum: "sumValue",
        min: "minValue",
        max: "maxValue",
        count: "dataPointCount",
      } as const
      const valueField = metricValueField[request.query.metric]

      return {
        result: {
          kind: "timeseries",
          source: "metrics",
          data: groupTimeSeriesRows(
            result.map((row) => ({
              bucket: row.bucket,
              groupName: row.serviceName,
              value: Number(row[valueField]),
            })),
            (row) => row.value,
            fillOptions,
          ),
        },
      }
    }

    if (request.query.source === "traces" && request.query.kind === "breakdown") {
      const result = yield* mapTinybirdError(
        tinybird.customTracesBreakdownQuery(tenant, {
          start_time: request.startTime,
          end_time: request.endTime,
          service_name: request.query.filters?.serviceName,
          span_name: request.query.filters?.spanName,
          limit: request.query.limit,
          root_only: request.query.filters?.rootSpansOnly ? "1" : undefined,
          environments: request.query.filters?.environments?.join(","),
          commit_shas: request.query.filters?.commitShas?.join(","),
          group_by_service: request.query.groupBy === "service" ? "1" : undefined,
          group_by_span_name: request.query.groupBy === "span_name" ? "1" : undefined,
          group_by_status_code: request.query.groupBy === "status_code" ? "1" : undefined,
          group_by_http_method: request.query.groupBy === "http_method" ? "1" : undefined,
          group_by_attribute:
            request.query.groupBy === "attribute"
              ? request.query.filters?.attributeKey
              : undefined,
          attribute_filter_key: request.query.filters?.attributeKey,
          attribute_filter_value: request.query.filters?.attributeValue,
          resource_filter_key: request.query.filters?.resourceAttributeKey,
          resource_filter_value: request.query.filters?.resourceAttributeValue,
        }),
        "Failed to execute traces breakdown query",
      )

      const fieldMap = {
        count: "count",
        avg_duration: "avgDuration",
        p50_duration: "p50Duration",
        p95_duration: "p95Duration",
        p99_duration: "p99Duration",
        error_rate: "errorRate",
      } as const
      const field = fieldMap[request.query.metric]

      return {
        result: {
          kind: "breakdown",
          source: "traces",
          data: result.map((row) => ({
            name: row.name,
            value: Number(row[field]),
          })),
        },
      }
    }

    if (request.query.source === "logs" && request.query.kind === "breakdown") {
      const result = yield* mapTinybirdError(
        tinybird.customLogsBreakdownQuery(tenant, {
          start_time: request.startTime,
          end_time: request.endTime,
          service_name: request.query.filters?.serviceName,
          severity: request.query.filters?.severity,
          limit: request.query.limit,
          group_by_service: request.query.groupBy === "service" ? "1" : undefined,
          group_by_severity: request.query.groupBy === "severity" ? "1" : undefined,
        }),
        "Failed to execute logs breakdown query",
      )

      return {
        result: {
          kind: "breakdown",
          source: "logs",
          data: result.map((row) => ({
            name: row.name,
            value: Number(row.count),
          })),
        },
      }
    }

    if (request.query.source === "metrics" && request.query.kind === "breakdown") {
      const result = yield* mapTinybirdError(
        tinybird.customMetricsBreakdownQuery(tenant, {
          metric_name: request.query.filters.metricName,
          start_time: request.startTime,
          end_time: request.endTime,
          metric_type: request.query.filters.metricType,
          limit: request.query.limit,
        }),
        "Failed to execute metrics breakdown query",
      )

      const valueFieldMap = {
        avg: "avgValue",
        sum: "sumValue",
        count: "count",
      } as const
      const valueField = valueFieldMap[request.query.metric]

      return {
        result: {
          kind: "breakdown",
          source: "metrics",
          data: result.map((row) => ({
            name: row.name,
            value: Number(row[valueField]),
          })),
        },
      }
    }

    return yield* new QueryEngineValidationError({
      message: "Unsupported query",
      details: ["This source/kind combination is not supported"],
    })
  })

export class QueryEngineService extends Effect.Service<QueryEngineService>()("QueryEngineService", {
  accessors: true,
  dependencies: [TinybirdService.Default],
  effect: Effect.gen(function* () {
    const tinybird = yield* TinybirdService
    const execute = makeQueryEngineExecute(tinybird)

    return {
      execute,
    }
  }),
}) {}
