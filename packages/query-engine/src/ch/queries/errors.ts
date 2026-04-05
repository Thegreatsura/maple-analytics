// ---------------------------------------------------------------------------
// Typed Error Queries
//
// DSL-based query definitions for error aggregation and timeseries.
// ---------------------------------------------------------------------------

import * as CH from "../expr"
import { param } from "../param"
import { from, type CHQuery } from "../query"
import { ErrorSpans } from "../tables"
import { escapeClickHouseString } from "../../sql/sql-fragment"
import type { CompiledQuery } from "../compile"

// ---------------------------------------------------------------------------
// Shared: Error fingerprint SQL expression
// ---------------------------------------------------------------------------

export const ERROR_FINGERPRINT_SQL = `if(StatusMessage = '', 'Unknown Error',
  left(StatusMessage, multiIf(
    position(StatusMessage, ': ') > 3, toInt64(position(StatusMessage, ': ')) - 1,
    position(StatusMessage, ' (') > 3, toInt64(position(StatusMessage, ' (')) - 1,
    position(StatusMessage, '\\n') > 3, toInt64(position(StatusMessage, '\\n')) - 1,
    position(StatusMessage, '{') > 10, toInt64(position(StatusMessage, '{')) - 1,
    least(toInt64(length(StatusMessage)), 150)
  ))
)`

// ---------------------------------------------------------------------------
// Errors by type
// ---------------------------------------------------------------------------

export interface ErrorsByTypeOpts {
  rootOnly?: boolean
  services?: readonly string[]
  deploymentEnvs?: readonly string[]
  errorTypes?: readonly string[]
  limit?: number
}

export interface ErrorsByTypeOutput {
  readonly errorType: string
  readonly sampleMessage: string
  readonly count: number
  readonly affectedServicesCount: number
  readonly firstSeen: string
  readonly lastSeen: string
}

export function errorsByTypeQuery(
  opts: ErrorsByTypeOpts,
): CHQuery<any, ErrorsByTypeOutput, { orgId: string; startTime: string; endTime: string }> {
  return from(ErrorSpans)
    .select(() => ({
      errorType: CH.rawExpr<string>(ERROR_FINGERPRINT_SQL),
      sampleMessage: CH.rawExpr<string>("any(StatusMessage)"),
      count: CH.count(),
      affectedServicesCount: CH.rawExpr<number>("uniq(ServiceName)"),
      firstSeen: CH.rawExpr<string>("min(Timestamp)"),
      lastSeen: CH.rawExpr<string>("max(Timestamp)"),
    }))
    .where(($) => [
      $.OrgId.eq(param.string("orgId")),
      $.Timestamp.gte(param.dateTime("startTime")),
      $.Timestamp.lte(param.dateTime("endTime")),
      CH.whenTrue(!!opts.rootOnly, () => CH.rawCond("ParentSpanId = ''")),
      opts.services?.length
        ? CH.inList(CH.rawExpr<string>("ServiceName"), opts.services)
        : undefined,
      opts.deploymentEnvs?.length
        ? CH.inList(CH.rawExpr<string>("DeploymentEnv"), opts.deploymentEnvs)
        : undefined,
      opts.errorTypes?.length
        ? CH.inList(CH.rawExpr<string>(ERROR_FINGERPRINT_SQL), opts.errorTypes)
        : undefined,
    ])
    .groupBy("errorType")
    .orderBy(["count", "desc"])
    .limit(opts.limit ?? 50)
    .format("JSON")
    .withParams<{ orgId: string; startTime: string; endTime: string }>()
}

// ---------------------------------------------------------------------------
// Errors timeseries
// ---------------------------------------------------------------------------

export interface ErrorsTimeseriesOpts {
  errorType: string
  services?: readonly string[]
}

export interface ErrorsTimeseriesOutput {
  readonly bucket: string
  readonly count: number
}

export function errorsTimeseriesQuery(
  opts: ErrorsTimeseriesOpts,
): CHQuery<any, ErrorsTimeseriesOutput, { orgId: string; startTime: string; endTime: string; bucketSeconds: number }> {
  const esc = escapeClickHouseString
  return from(ErrorSpans)
    .select(($) => ({
      bucket: CH.toStartOfInterval($.Timestamp, param.int("bucketSeconds")),
      count: CH.count(),
    }))
    .where(($) => [
      $.OrgId.eq(param.string("orgId")),
      CH.rawCond(`${ERROR_FINGERPRINT_SQL} = '${esc(opts.errorType)}'`),
      $.Timestamp.gte(param.dateTime("startTime")),
      $.Timestamp.lte(param.dateTime("endTime")),
      opts.services?.length
        ? CH.inList(CH.rawExpr<string>("ServiceName"), opts.services)
        : undefined,
    ])
    .groupBy("bucket")
    .orderBy(["bucket", "asc"])
    .format("JSON")
    .withParams<{ orgId: string; startTime: string; endTime: string; bucketSeconds: number }>()
}

// ---------------------------------------------------------------------------
// Span hierarchy (raw SQL — needs toJSONString, conditional span name rewrite)
// ---------------------------------------------------------------------------

export interface SpanHierarchyOpts {
  traceId: string
  spanId?: string
}

export interface SpanHierarchyOutput {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId: string
  readonly spanName: string
  readonly serviceName: string
  readonly spanKind: string
  readonly durationMs: number
  readonly startTime: string
  readonly statusCode: string
  readonly statusMessage: string
  readonly spanAttributes: string
  readonly resourceAttributes: string
  readonly relationship: string
}

export function spanHierarchySQL(
  opts: SpanHierarchyOpts,
  params: { orgId: string },
): CompiledQuery<SpanHierarchyOutput> {
  const esc = escapeClickHouseString
  const relationshipExpr = opts.spanId
    ? `if(SpanId = '${esc(opts.spanId)}', 'target', 'related')`
    : `'related'`

  const sql = `SELECT
  TraceId AS traceId,
  SpanId AS spanId,
  ParentSpanId AS parentSpanId,
  if(
    (SpanName LIKE 'http.server %' OR SpanName IN ('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'))
    AND (SpanAttributes['http.route'] != '' OR SpanAttributes['url.path'] != ''),
    concat(
      if(SpanName LIKE 'http.server %', replaceOne(SpanName, 'http.server ', ''), SpanName),
      ' ',
      if(SpanAttributes['http.route'] != '', SpanAttributes['http.route'], SpanAttributes['url.path'])
    ),
    SpanName
  ) AS spanName,
  ServiceName AS serviceName,
  SpanKind AS spanKind,
  Duration / 1000000 AS durationMs,
  Timestamp AS startTime,
  StatusCode AS statusCode,
  StatusMessage AS statusMessage,
  toJSONString(SpanAttributes) AS spanAttributes,
  toJSONString(ResourceAttributes) AS resourceAttributes,
  ${relationshipExpr} AS relationship
FROM traces
WHERE TraceId = '${esc(opts.traceId)}'
  AND OrgId = '${esc(params.orgId)}'
ORDER BY Timestamp ASC
FORMAT JSON`

  return {
    sql,
    castRows: (rows) => rows as unknown as ReadonlyArray<SpanHierarchyOutput>,
  }
}

// ---------------------------------------------------------------------------
// Traces duration stats
// ---------------------------------------------------------------------------

export interface TracesDurationStatsOpts {
  serviceName?: string
  spanName?: string
  hasError?: boolean
  minDurationMs?: number
  maxDurationMs?: number
  httpMethod?: string
  httpStatusCode?: string
  deploymentEnv?: string
  matchModes?: {
    serviceName?: "contains"
    spanName?: "contains"
    deploymentEnv?: "contains"
  }
}

export interface TracesDurationStatsOutput {
  readonly minDurationMs: number
  readonly maxDurationMs: number
  readonly p50DurationMs: number
  readonly p95DurationMs: number
}

export function tracesDurationStatsSQL(
  opts: TracesDurationStatsOpts,
  params: { orgId: string; startTime: string; endTime: string },
): CompiledQuery<TracesDurationStatsOutput> {
  const esc = escapeClickHouseString
  const mm = opts.matchModes
  const conditions: string[] = [
    `OrgId = '${esc(params.orgId)}'`,
    `Timestamp >= '${esc(params.startTime)}'`,
    `Timestamp <= '${esc(params.endTime)}'`,
  ]

  if (opts.serviceName) {
    conditions.push(
      mm?.serviceName === "contains"
        ? `positionCaseInsensitive(ServiceName, '${esc(opts.serviceName)}') > 0`
        : `ServiceName = '${esc(opts.serviceName)}'`,
    )
  }
  if (opts.spanName) {
    conditions.push(
      mm?.spanName === "contains"
        ? `positionCaseInsensitive(SpanName, '${esc(opts.spanName)}') > 0`
        : `SpanName = '${esc(opts.spanName)}'`,
    )
  }
  if (opts.hasError) conditions.push("HasError = 1")
  if (opts.minDurationMs != null) conditions.push(`Duration >= ${opts.minDurationMs} * 1000000`)
  if (opts.maxDurationMs != null) conditions.push(`Duration <= ${opts.maxDurationMs} * 1000000`)
  if (opts.httpMethod) conditions.push(`HttpMethod = '${esc(opts.httpMethod)}'`)
  if (opts.httpStatusCode) conditions.push(`HttpStatusCode = '${esc(opts.httpStatusCode)}'`)
  if (opts.deploymentEnv) {
    conditions.push(
      mm?.deploymentEnv === "contains"
        ? `positionCaseInsensitive(DeploymentEnv, '${esc(opts.deploymentEnv)}') > 0`
        : `DeploymentEnv = '${esc(opts.deploymentEnv)}'`,
    )
  }

  const sql = `SELECT
  min(Duration) / 1000000.0 AS minDurationMs,
  max(Duration) / 1000000.0 AS maxDurationMs,
  quantile(0.5)(Duration) / 1000000.0 AS p50DurationMs,
  quantile(0.95)(Duration) / 1000000.0 AS p95DurationMs
FROM trace_list_mv
WHERE ${conditions.join("\n  AND ")}
FORMAT JSON`

  return {
    sql,
    castRows: (rows) => rows as unknown as ReadonlyArray<TracesDurationStatsOutput>,
  }
}
