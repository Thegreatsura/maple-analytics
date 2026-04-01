import type { SqlFragment } from "./sql-fragment"
import { compile } from "./sql-fragment"

// ---------------------------------------------------------------------------
// Query structure
// ---------------------------------------------------------------------------

export interface SqlQuery {
  readonly select: ReadonlyArray<SqlFragment>
  readonly from: SqlFragment
  readonly where: ReadonlyArray<SqlFragment>
  readonly groupBy: ReadonlyArray<SqlFragment>
  readonly orderBy: ReadonlyArray<SqlFragment>
  readonly limit?: SqlFragment
  readonly offset?: SqlFragment
  readonly format?: string
}

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

export function compileQuery(q: SqlQuery): string {
  const parts: string[] = []

  // SELECT
  const selectCols = q.select.map(compile).filter(Boolean)
  parts.push(`SELECT\n          ${selectCols.join(",\n          ")}`)

  // FROM
  parts.push(`FROM ${compile(q.from)}`)

  // WHERE
  const whereClauses = q.where.map(compile).filter(Boolean)
  if (whereClauses.length > 0) {
    parts.push(`WHERE ${whereClauses.join("\n          AND ")}`)
  }

  // GROUP BY
  if (q.groupBy.length > 0) {
    parts.push(`GROUP BY ${q.groupBy.map(compile).join(", ")}`)
  }

  // ORDER BY
  if (q.orderBy.length > 0) {
    parts.push(`ORDER BY ${q.orderBy.map(compile).join(", ")}`)
  }

  // LIMIT
  if (q.limit) {
    parts.push(`LIMIT ${compile(q.limit)}`)
  }

  // OFFSET
  if (q.offset) {
    parts.push(`OFFSET ${compile(q.offset)}`)
  }

  // FORMAT
  if (q.format) {
    parts.push(`FORMAT ${q.format}`)
  }

  return parts.join("\n        ")
}
