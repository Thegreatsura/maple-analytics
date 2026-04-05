// ---------------------------------------------------------------------------
// Typed Logs Queries
//
// DSL-based query definitions for logs timeseries and breakdown.
// ---------------------------------------------------------------------------

import * as CH from "../expr"
import { param } from "../param"
import { from, type CHQuery } from "../query"
import { Logs } from "../tables"

// ---------------------------------------------------------------------------
// Shared options
// ---------------------------------------------------------------------------

interface LogsQueryOpts {
  serviceName?: string
  severity?: string
}

// ---------------------------------------------------------------------------
// Timeseries query
// ---------------------------------------------------------------------------

export interface LogsTimeseriesOpts extends LogsQueryOpts {
  groupBy?: readonly string[]
}

export interface LogsTimeseriesOutput {
  readonly bucket: string
  readonly groupName: string
  readonly count: number
}

export function logsTimeseriesQuery(
  opts: LogsTimeseriesOpts,
): CHQuery<any, LogsTimeseriesOutput, { orgId: string; startTime: string; endTime: string; bucketSeconds: number }> {
  const groupByService = opts.groupBy?.includes("service")
  const groupBySeverity = opts.groupBy?.includes("severity")

  const groupNameExpr = buildLogsGroupNameExpr(groupByService, groupBySeverity)

  return from(Logs)
    .select(($) => ({
      bucket: CH.toStartOfInterval($.Timestamp, param.int("bucketSeconds")),
      groupName: groupNameExpr,
      count: CH.count(),
    }))
    .where(($) => [
      $.OrgId.eq(param.string("orgId")),
      $.Timestamp.gte(param.dateTime("startTime")),
      $.Timestamp.lte(param.dateTime("endTime")),
      CH.when(opts.serviceName, (v: string) => $.ServiceName.eq(v)),
      CH.when(opts.severity, (v: string) => $.SeverityText.eq(v)),
    ])
    .groupBy("bucket", "groupName")
    .orderBy(["bucket", "asc"], ["groupName", "asc"])
    .format("JSON")
    .withParams<{ orgId: string; startTime: string; endTime: string; bucketSeconds: number }>()
}

function buildLogsGroupNameExpr(
  groupByService?: boolean,
  groupBySeverity?: boolean,
): CH.Expr<string> {
  if (!groupByService && !groupBySeverity) {
    return CH.lit("all")
  }

  const parts: string[] = []
  if (groupByService) parts.push("toString(ServiceName)")
  if (groupBySeverity) parts.push("toString(SeverityText)")

  if (parts.length === 1) {
    return CH.rawExpr<string>(`coalesce(nullIf(${parts[0]}, ''), 'all')`)
  }

  return CH.rawExpr<string>(
    `coalesce(nullIf(arrayStringConcat(arrayFilter(x -> x != '', [${parts.join(", ")}]), ' \u00b7 '), ''), 'all')`,
  )
}

// ---------------------------------------------------------------------------
// Breakdown query
// ---------------------------------------------------------------------------

export interface LogsBreakdownOpts extends LogsQueryOpts {
  groupBy: "service" | "severity"
  limit?: number
}

export interface LogsBreakdownOutput {
  readonly name: string
  readonly count: number
}

export function logsBreakdownQuery(
  opts: LogsBreakdownOpts,
): CHQuery<any, LogsBreakdownOutput, { orgId: string; startTime: string; endTime: string }> {
  const nameExpr = opts.groupBy === "severity"
    ? CH.rawExpr<string>("SeverityText")
    : CH.rawExpr<string>("ServiceName")

  return from(Logs)
    .select(() => ({
      name: nameExpr,
      count: CH.count(),
    }))
    .where(({ OrgId, Timestamp, ServiceName, SeverityText }) => [
      OrgId.eq(param.string("orgId")),
      Timestamp.gte(param.dateTime("startTime")),
      Timestamp.lte(param.dateTime("endTime")),
      CH.when(opts.serviceName, (v: string) => ServiceName.eq(v)),
      CH.when(opts.severity, (v: string) => SeverityText.eq(v)),
    ])
    .groupBy("name")
    .orderBy(["count", "desc"])
    .limit(opts.limit ?? 10)
    .format("JSON")
    .withParams<{ orgId: string; startTime: string; endTime: string }>()
}
