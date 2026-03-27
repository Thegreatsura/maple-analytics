import type { AttributeFilter } from "../query-engine"
import type { SqlFragment } from "./sql-fragment"
import { compile, raw, str } from "./sql-fragment"

// ---------------------------------------------------------------------------
// Comparison operators
// ---------------------------------------------------------------------------

export const eq = (col: string, value: SqlFragment): SqlFragment =>
  raw(`${col} = ${compile(value)}`)

export const neq = (col: string, value: SqlFragment): SqlFragment =>
  raw(`${col} != ${compile(value)}`)

export const gt = (col: string, value: SqlFragment): SqlFragment =>
  raw(`${col} > ${compile(value)}`)

export const gte = (col: string, value: SqlFragment): SqlFragment =>
  raw(`${col} >= ${compile(value)}`)

export const lt = (col: string, value: SqlFragment): SqlFragment =>
  raw(`${col} < ${compile(value)}`)

export const lte = (col: string, value: SqlFragment): SqlFragment =>
  raw(`${col} <= ${compile(value)}`)

export const inList = (col: string, values: ReadonlyArray<SqlFragment>): SqlFragment =>
  raw(`${col} IN (${values.map(compile).join(", ")})`)

// ---------------------------------------------------------------------------
// ClickHouse functions
// ---------------------------------------------------------------------------

export const toStartOfInterval = (col: string, seconds: number): SqlFragment =>
  raw(`toStartOfInterval(${col}, INTERVAL ${Math.round(seconds)} SECOND)`)

// ---------------------------------------------------------------------------
// Attribute filter builder
// ---------------------------------------------------------------------------

const MODE_TO_OPERATOR: Record<string, string> = {
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
}

/** Numeric columns in trace_list_mv that need casting from string for comparisons */
const NUMERIC_MV_COLUMNS = new Set(["HttpStatusCode"])

export function attrFilter(
  af: AttributeFilter,
  useMv: boolean,
  mapName: "SpanAttributes" | "ResourceAttributes",
  mvMap: Record<string, string>,
): SqlFragment {
  const mvColumn = useMv ? mvMap[af.key] : undefined
  const escapedKey = compile(str(af.key))
  const escapedValue = compile(str(af.value ?? ""))

  if (af.mode === "exists") {
    return mvColumn
      ? raw(`${mvColumn} != ''`)
      : raw(`mapContains(${mapName}, ${escapedKey})`)
  }

  if (af.mode === "contains") {
    const col = mvColumn ?? `${mapName}[${escapedKey}]`
    return raw(`positionCaseInsensitive(${col}, ${escapedValue}) > 0`)
  }

  const op = MODE_TO_OPERATOR[af.mode]
  if (op) {
    if (mvColumn) {
      const cast = NUMERIC_MV_COLUMNS.has(mvColumn) ? `toUInt16OrZero(${mvColumn})` : mvColumn
      return raw(`${cast} ${op} ${escapedValue}`)
    }
    // For numeric comparisons on map values, use escapeClickHouseString (no quotes)
    const rawEscapedValue = af.value?.replace(/\\/g, "\\\\").replace(/'/g, "\\'") ?? ""
    return raw(`toFloat64OrZero(${mapName}[${escapedKey}]) ${op} ${rawEscapedValue}`)
  }

  // equals (default)
  if (mvColumn) {
    return raw(`${mvColumn} = ${escapedValue}`)
  }
  return raw(`${mapName}[${escapedKey}] = ${escapedValue}`)
}
