import type { TracesMetric, AttributeFilter } from "./query-engine"

// ---------------------------------------------------------------------------
// ClickHouse string escaping
// ---------------------------------------------------------------------------

export function escapeClickHouseString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

function esc(value: string): string {
  return `'${escapeClickHouseString(value)}'`
}

function escInt(value: number): string {
  return String(Math.round(value))
}

// ---------------------------------------------------------------------------
// Row types returned by SQL queries
// ---------------------------------------------------------------------------

export interface TracesTimeseriesRow {
  readonly bucket: string | Date
  readonly groupName: string
  readonly count: number
  readonly avgDuration: number
  readonly p50Duration: number
  readonly p95Duration: number
  readonly p99Duration: number
  readonly errorRate: number
  readonly satisfiedCount: number
  readonly toleratingCount: number
  readonly apdexScore: number
  readonly sampledSpanCount: number
  readonly unsampledSpanCount: number
  readonly dominantThreshold: string
}

export interface TracesBreakdownRow {
  readonly name: string
  readonly count: number
  readonly avgDuration: number
  readonly p50Duration: number
  readonly p95Duration: number
  readonly p99Duration: number
  readonly errorRate: number
  readonly satisfiedCount: number
  readonly toleratingCount: number
  readonly apdexScore: number
}

// ---------------------------------------------------------------------------
// Metric → SELECT columns mapping
// ---------------------------------------------------------------------------

type MetricNeed = "count" | "avg_duration" | "quantiles" | "error_rate" | "apdex"

const METRIC_NEEDS: Record<TracesMetric, MetricNeed[]> = {
  count: ["count"],
  avg_duration: ["count", "avg_duration"],
  p50_duration: ["count", "quantiles"],
  p95_duration: ["count", "quantiles"],
  p99_duration: ["count", "quantiles"],
  error_rate: ["count", "error_rate"],
  apdex: ["count", "apdex"],
}

function buildSelectColumns(
  metric: TracesMetric,
  needsSampling: boolean,
  apdexThresholdMs: number,
): string[] {
  const needs = new Set(METRIC_NEEDS[metric])
  const cols: string[] = ["count() AS count"]

  if (needs.has("avg_duration")) {
    cols.push("avg(Duration) / 1000000 AS avgDuration")
  } else {
    cols.push("0 AS avgDuration")
  }

  if (needs.has("quantiles")) {
    cols.push(
      "quantile(0.5)(Duration) / 1000000 AS p50Duration",
      "quantile(0.95)(Duration) / 1000000 AS p95Duration",
      "quantile(0.99)(Duration) / 1000000 AS p99Duration",
    )
  } else {
    cols.push("0 AS p50Duration", "0 AS p95Duration", "0 AS p99Duration")
  }

  if (needs.has("error_rate")) {
    cols.push("if(count() > 0, countIf(StatusCode = 'Error') * 100.0 / count(), 0) AS errorRate")
  } else {
    cols.push("0 AS errorRate")
  }

  const t = String(apdexThresholdMs)
  if (needs.has("apdex")) {
    cols.push(
      `countIf(Duration / 1000000 < ${t}) AS satisfiedCount`,
      `countIf(Duration / 1000000 >= ${t} AND Duration / 1000000 < ${t} * 4) AS toleratingCount`,
      `if(count() > 0, round((countIf(Duration / 1000000 < ${t}) + countIf(Duration / 1000000 >= ${t} AND Duration / 1000000 < ${t} * 4) * 0.5) / count(), 4), 0) AS apdexScore`,
    )
  } else {
    cols.push("0 AS satisfiedCount", "0 AS toleratingCount", "0 AS apdexScore")
  }

  if (needsSampling) {
    cols.push(
      "countIf(TraceState LIKE '%th:%') AS sampledSpanCount",
      "countIf(TraceState = '' OR TraceState NOT LIKE '%th:%') AS unsampledSpanCount",
      "anyIf(extract(TraceState, 'th:([0-9a-f]+)'), TraceState LIKE '%th:%') AS dominantThreshold",
    )
  } else {
    cols.push("0 AS sampledSpanCount", "0 AS unsampledSpanCount", "'' AS dominantThreshold")
  }

  return cols
}

// ---------------------------------------------------------------------------
// GROUP BY expression builder
// ---------------------------------------------------------------------------

function buildGroupNameExpression(
  groupBy: readonly string[] | undefined,
  groupByAttributeKeys: readonly string[] | undefined,
  useTraceListMv: boolean,
): string {
  if (!groupBy || groupBy.length === 0) {
    return "'all' AS groupName"
  }

  const parts: string[] = []
  for (const g of groupBy) {
    switch (g) {
      case "service":
        parts.push("toString(ServiceName)")
        break
      case "span_name":
        parts.push("toString(SpanName)")
        break
      case "status_code":
        parts.push("toString(StatusCode)")
        break
      case "http_method":
        if (useTraceListMv) {
          parts.push("toString(HttpMethod)")
        } else {
          parts.push("toString(SpanAttributes['http.method'])")
        }
        break
      case "attribute":
        if (groupByAttributeKeys?.length) {
          const keys = groupByAttributeKeys.map((k) => {
            const mvCol = useTraceListMv ? TRACE_LIST_MV_ATTR_MAP[k] : undefined
            return mvCol ? `toString(${mvCol})` : `toString(SpanAttributes[${esc(k)}])`
          })
          parts.push(`arrayStringConcat([${keys.join(", ")}], ' · ')`)
        }
        break
      case "none":
        break
    }
  }

  if (parts.length === 0) {
    return "'all' AS groupName"
  }

  if (parts.length === 1) {
    return `coalesce(nullIf(${parts[0]}, ''), 'all') AS groupName`
  }

  return `coalesce(nullIf(arrayStringConcat(arrayFilter(x -> x != '', [${parts.join(", ")}]), ' · '), ''), 'all') AS groupName`
}

// ---------------------------------------------------------------------------
// trace_list_mv column mapping (pre-extracted HTTP attributes)
// ---------------------------------------------------------------------------

const TRACE_LIST_MV_ATTR_MAP: Record<string, string> = {
  "http.method": "HttpMethod",
  "http.request.method": "HttpMethod",
  "http.route": "HttpRoute",
  "url.path": "HttpRoute",
  "http.target": "HttpRoute",
  "http.status_code": "HttpStatusCode",
  "http.response.status_code": "HttpStatusCode",
}

const TRACE_LIST_MV_RESOURCE_MAP: Record<string, string> = {
  "deployment.environment": "DeploymentEnv",
}

/** Numeric columns in trace_list_mv that need casting from string for comparisons */
const NUMERIC_MV_COLUMNS = new Set(["HttpStatusCode"])

function canUseTraceListMv(params: {
  rootOnly?: boolean
  attributeFilters?: readonly AttributeFilter[]
  resourceAttributeFilters?: readonly AttributeFilter[]
  commitShas?: readonly string[]
  groupBy?: readonly string[] | string
  groupByAttributeKeys?: readonly string[]
  groupByAttributeKey?: string
}): boolean {
  if (!params.rootOnly) return false

  // trace_list_mv doesn't have CommitSha
  if (params.commitShas?.length) return false

  // Check all attribute filters map to pre-extracted columns
  if (params.attributeFilters) {
    for (const af of params.attributeFilters) {
      if (!TRACE_LIST_MV_ATTR_MAP[af.key]) return false
    }
  }

  // Check all resource filters map to pre-extracted columns
  if (params.resourceAttributeFilters) {
    for (const rf of params.resourceAttributeFilters) {
      if (!TRACE_LIST_MV_RESOURCE_MAP[rf.key]) return false
    }
  }

  // Check groupBy doesn't use unmapped custom attributes
  const groupByArray = Array.isArray(params.groupBy) ? params.groupBy : params.groupBy ? [params.groupBy] : []
  if (groupByArray.includes("attribute")) {
    const attrKeys = params.groupByAttributeKeys ?? (params.groupByAttributeKey ? [params.groupByAttributeKey] : [])
    for (const key of attrKeys) {
      if (!TRACE_LIST_MV_ATTR_MAP[key]) return false
    }
  }

  return true
}

// ---------------------------------------------------------------------------
// Comparison SQL helpers
// ---------------------------------------------------------------------------

const MODE_TO_OPERATOR: Record<string, string> = {
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
}

function buildAttrFilterSQL(
  af: AttributeFilter,
  useTraceListMv: boolean,
  mapName: "SpanAttributes" | "ResourceAttributes",
  mvMap: Record<string, string>,
): string {
  const mvColumn = useTraceListMv ? mvMap[af.key] : undefined

  if (af.mode === "exists") {
    return mvColumn
      ? `${mvColumn} != ''`
      : `mapContains(${mapName}, ${esc(af.key)})`
  }

  if (af.mode === "contains") {
    const col = mvColumn ?? `${mapName}[${esc(af.key)}]`
    return `positionCaseInsensitive(${col}, ${esc(af.value ?? "")}) > 0`
  }

  const op = MODE_TO_OPERATOR[af.mode]
  if (op) {
    // Comparison operator — need numeric cast for string columns
    if (mvColumn) {
      const cast = NUMERIC_MV_COLUMNS.has(mvColumn) ? `toUInt16OrZero(${mvColumn})` : mvColumn
      return `${cast} ${op} ${esc(af.value ?? "")}`
    }
    return `toFloat64OrZero(${mapName}[${esc(af.key)}]) ${op} ${escapeClickHouseString(af.value ?? "")}`
  }

  // equals (default)
  if (mvColumn) {
    return `${mvColumn} = ${esc(af.value ?? "")}`
  }
  return `${mapName}[${esc(af.key)}] = ${esc(af.value ?? "")}`
}

// ---------------------------------------------------------------------------
// WHERE clause builder
// ---------------------------------------------------------------------------

interface WhereClauseParams {
  orgId: string
  startTime: string
  endTime: string
  serviceName?: string
  spanName?: string
  rootOnly?: boolean
  errorsOnly?: boolean
  environments?: readonly string[]
  commitShas?: readonly string[]
  attributeFilters?: readonly AttributeFilter[]
  resourceAttributeFilters?: readonly AttributeFilter[]
}

function buildWhereClause(params: WhereClauseParams, useTraceListMv: boolean): string {
  const clauses: string[] = [
    `OrgId = ${esc(params.orgId)}`,
  ]

  if (params.serviceName) {
    clauses.push(`ServiceName = ${esc(params.serviceName)}`)
  }
  if (params.spanName) {
    clauses.push(`SpanName = ${esc(params.spanName)}`)
  }

  clauses.push(
    `Timestamp >= ${esc(params.startTime)}`,
    `Timestamp <= ${esc(params.endTime)}`,
  )

  // trace_list_mv only has root spans, so skip the ParentSpanId filter
  if (params.rootOnly && !useTraceListMv) {
    clauses.push("ParentSpanId = ''")
  }
  if (params.errorsOnly) {
    if (useTraceListMv) {
      clauses.push("HasError = 1")
    } else {
      clauses.push("StatusCode = 'Error'")
    }
  }
  if (params.environments?.length) {
    if (useTraceListMv) {
      const envList = params.environments.map(esc).join(", ")
      clauses.push(`DeploymentEnv IN (${envList})`)
    } else {
      const envList = params.environments.map(esc).join(", ")
      clauses.push(`ResourceAttributes['deployment.environment'] IN (${envList})`)
    }
  }
  if (params.commitShas?.length) {
    // trace_list_mv doesn't have CommitSha — if we're here with useTraceListMv=true,
    // canUseTraceListMv should have returned false. Fall back to raw traces pattern.
    const shaList = params.commitShas.map(esc).join(", ")
    clauses.push(`ResourceAttributes['deployment.commit_sha'] IN (${shaList})`)
  }

  if (params.attributeFilters) {
    for (const af of params.attributeFilters) {
      clauses.push(buildAttrFilterSQL(af, useTraceListMv, "SpanAttributes", TRACE_LIST_MV_ATTR_MAP))
    }
  }

  if (params.resourceAttributeFilters) {
    for (const rf of params.resourceAttributeFilters) {
      clauses.push(buildAttrFilterSQL(rf, useTraceListMv, "ResourceAttributes", TRACE_LIST_MV_RESOURCE_MAP))
    }
  }

  return clauses.join("\n          AND ")
}

// ---------------------------------------------------------------------------
// Timeseries SQL builder
// ---------------------------------------------------------------------------

export interface BuildTracesTimeseriesSQLParams {
  orgId: string
  startTime: string
  endTime: string
  bucketSeconds: number
  metric: TracesMetric
  needsSampling: boolean
  serviceName?: string
  spanName?: string
  rootOnly?: boolean
  errorsOnly?: boolean
  groupBy?: readonly string[]
  groupByAttributeKeys?: readonly string[]
  environments?: readonly string[]
  commitShas?: readonly string[]
  attributeFilters?: readonly AttributeFilter[]
  resourceAttributeFilters?: readonly AttributeFilter[]
  apdexThresholdMs?: number
}

export function buildTracesTimeseriesSQL(params: BuildTracesTimeseriesSQLParams): string {
  const apdexThresholdMs = params.apdexThresholdMs ?? 500
  const useTraceListMv = canUseTraceListMv(params)
  const tableName = useTraceListMv ? "trace_list_mv" : "traces"
  const selectCols = buildSelectColumns(params.metric, params.needsSampling, apdexThresholdMs)
  const groupNameExpr = buildGroupNameExpression(params.groupBy, params.groupByAttributeKeys, useTraceListMv)
  const where = buildWhereClause(params, useTraceListMv)

  return `SELECT
          toStartOfInterval(Timestamp, INTERVAL ${escInt(params.bucketSeconds)} SECOND) AS bucket,
          ${groupNameExpr},
          ${selectCols.join(",\n          ")}
        FROM ${tableName}
        WHERE ${where}
        GROUP BY bucket, groupName
        ORDER BY bucket ASC, groupName ASC
        FORMAT JSON`
}

// ---------------------------------------------------------------------------
// Breakdown SQL builder
// ---------------------------------------------------------------------------

export interface BuildTracesBreakdownSQLParams {
  orgId: string
  startTime: string
  endTime: string
  metric: TracesMetric
  groupBy: string
  groupByAttributeKey?: string
  limit?: number
  serviceName?: string
  spanName?: string
  rootOnly?: boolean
  errorsOnly?: boolean
  environments?: readonly string[]
  commitShas?: readonly string[]
  attributeFilters?: readonly AttributeFilter[]
  resourceAttributeFilters?: readonly AttributeFilter[]
  apdexThresholdMs?: number
}

function buildBreakdownGroupExpression(groupBy: string, groupByAttributeKey?: string): string {
  switch (groupBy) {
    case "service":
      return "ServiceName AS name"
    case "span_name":
      return "SpanName AS name"
    case "status_code":
      return "StatusCode AS name"
    case "http_method":
      return "SpanAttributes['http.method'] AS name"
    case "attribute":
      return groupByAttributeKey
        ? `SpanAttributes[${esc(groupByAttributeKey)}] AS name`
        : "ServiceName AS name"
    default:
      return "ServiceName AS name"
  }
}

function buildBreakdownSelectColumns(
  metric: TracesMetric,
  apdexThresholdMs: number,
): string[] {
  const needs = new Set(METRIC_NEEDS[metric])
  const cols: string[] = ["count() AS count"]

  if (needs.has("avg_duration")) {
    cols.push("avg(Duration) / 1000000 AS avgDuration")
  } else {
    cols.push("0 AS avgDuration")
  }

  if (needs.has("quantiles")) {
    cols.push(
      "quantile(0.5)(Duration) / 1000000 AS p50Duration",
      "quantile(0.95)(Duration) / 1000000 AS p95Duration",
      "quantile(0.99)(Duration) / 1000000 AS p99Duration",
    )
  } else {
    cols.push("0 AS p50Duration", "0 AS p95Duration", "0 AS p99Duration")
  }

  if (needs.has("error_rate")) {
    cols.push("if(count() > 0, countIf(StatusCode = 'Error') * 100.0 / count(), 0) AS errorRate")
  } else {
    cols.push("0 AS errorRate")
  }

  const t = String(apdexThresholdMs)
  if (needs.has("apdex")) {
    cols.push(
      `countIf(Duration / 1000000 < ${t}) AS satisfiedCount`,
      `countIf(Duration / 1000000 >= ${t} AND Duration / 1000000 < ${t} * 4) AS toleratingCount`,
      `if(count() > 0, round((countIf(Duration / 1000000 < ${t}) + countIf(Duration / 1000000 >= ${t} AND Duration / 1000000 < ${t} * 4) * 0.5) / count(), 4), 0) AS apdexScore`,
    )
  } else {
    cols.push("0 AS satisfiedCount", "0 AS toleratingCount", "0 AS apdexScore")
  }

  return cols
}

export function buildTracesBreakdownSQL(params: BuildTracesBreakdownSQLParams): string {
  const apdexThresholdMs = params.apdexThresholdMs ?? 500
  const limit = params.limit ?? 10
  const useTraceListMv = canUseTraceListMv(params)
  const tableName = useTraceListMv ? "trace_list_mv" : "traces"
  const selectCols = buildBreakdownSelectColumns(params.metric, apdexThresholdMs)
  const groupExpr = buildBreakdownGroupExpression(params.groupBy, params.groupByAttributeKey)
  const where = buildWhereClause(params, useTraceListMv)

  return `SELECT
          ${groupExpr},
          ${selectCols.join(",\n          ")}
        FROM ${tableName}
        WHERE ${where}
        GROUP BY name
        ORDER BY count DESC
        LIMIT ${escInt(limit)}
        FORMAT JSON`
}
