import * as CH from "../expr"
import { param } from "../param"
import { from, type CHQuery } from "../query"
import { AttributeKeysHourly } from "../tables"
import { escapeClickHouseString } from "../../sql/sql-fragment"
import type { CompiledQuery } from "../compile"

export interface AttributeKeysQueryOpts {
  scope: string
  limit?: number
}

export interface AttributeKeysOutput {
  readonly attributeKey: string
  readonly usageCount: number
}

export function attributeKeysQuery(
  opts: AttributeKeysQueryOpts,
): CHQuery<
  typeof AttributeKeysHourly.columns,
  AttributeKeysOutput,
  { orgId: string; startTime: string; endTime: string }
> {
  return from(AttributeKeysHourly)
    .select(($) => ({
      attributeKey: $.AttributeKey as unknown as CH.Expr<string>,
      usageCount: CH.sum($.UsageCount),
    }))
    .where(($) => [
      $.OrgId.eq(param.string("orgId")),
      $.Hour.gte(param.string("startTime")),
      $.Hour.lte(param.string("endTime")),
      $.AttributeScope.eq(param.string("scope")),
    ])
    .groupBy("attributeKey")
    .orderBy(["usageCount", "desc"])
    .limit(opts.limit ?? 200)
    .format("JSON")
    .withParams<{ orgId: string; startTime: string; endTime: string }>()
}

// ---------------------------------------------------------------------------
// Attribute values queries (raw SQL — dynamic map column access)
// ---------------------------------------------------------------------------

export interface AttributeValuesOpts {
  attributeKey: string
  limit?: number
}

export interface AttributeValuesOutput {
  readonly attributeValue: string
  readonly usageCount: number
}

export function spanAttributeValuesSQL(
  opts: AttributeValuesOpts,
  params: { orgId: string; startTime: string; endTime: string },
): CompiledQuery<AttributeValuesOutput> {
  const esc = escapeClickHouseString
  const sql = `SELECT
  SpanAttributes['${esc(opts.attributeKey)}'] AS attributeValue,
  count() AS usageCount
FROM traces
WHERE OrgId = '${esc(params.orgId)}'
  AND Timestamp >= '${esc(params.startTime)}'
  AND Timestamp <= '${esc(params.endTime)}'
  AND SpanAttributes['${esc(opts.attributeKey)}'] != ''
GROUP BY attributeValue
ORDER BY usageCount DESC
LIMIT ${Math.round(opts.limit ?? 50)}
FORMAT JSON`

  return {
    sql,
    castRows: (rows) => rows as unknown as ReadonlyArray<AttributeValuesOutput>,
  }
}

export function resourceAttributeValuesSQL(
  opts: AttributeValuesOpts,
  params: { orgId: string; startTime: string; endTime: string },
): CompiledQuery<AttributeValuesOutput> {
  const esc = escapeClickHouseString
  const sql = `SELECT
  ResourceAttributes['${esc(opts.attributeKey)}'] AS attributeValue,
  count() AS usageCount
FROM traces
WHERE OrgId = '${esc(params.orgId)}'
  AND Timestamp >= '${esc(params.startTime)}'
  AND Timestamp <= '${esc(params.endTime)}'
  AND ResourceAttributes['${esc(opts.attributeKey)}'] != ''
GROUP BY attributeValue
ORDER BY usageCount DESC
LIMIT ${Math.round(opts.limit ?? 50)}
FORMAT JSON`

  return {
    sql,
    castRows: (rows) => rows as unknown as ReadonlyArray<AttributeValuesOutput>,
  }
}
