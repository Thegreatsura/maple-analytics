import { parseWhereClause, normalizeKey } from "@maple/query-engine/where-clause"

export interface PerformanceHint {
  key: string
  location: "filter" | "groupBy"
  speed: "fast" | "slow"
  reason: string
}

const FAST_FILTER_KEYS = new Set([
  "service.name",
  "span.name",
  "root_only",
  "has_error",
  "status.code",
])

const FAST_GROUP_BY_KEYS = new Set([
  "service.name",
  "span.name",
  "status.code",
  "none",
])

export function getPerformanceHints(
  whereClause: string,
  groupByKeys: string[],
): PerformanceHint[] {
  const hints: PerformanceHint[] = []

  const { clauses } = parseWhereClause(whereClause)
  for (const clause of clauses) {
    const key = normalizeKey(clause.key)
    if (key.startsWith("attr.") || key.startsWith("resource.")) {
      hints.push({
        key: clause.key,
        location: "filter",
        speed: "slow",
        reason: "Scans Map column for every row",
      })
    } else if (key === "deployment.environment" || key === "deployment.commit_sha") {
      hints.push({
        key: clause.key,
        location: "filter",
        speed: "slow",
        reason: "Reads from ResourceAttributes Map column",
      })
    } else if (FAST_FILTER_KEYS.has(key)) {
      hints.push({
        key: clause.key,
        location: "filter",
        speed: "fast",
        reason: "Uses indexed column",
      })
    }
  }

  for (const raw of groupByKeys) {
    const token = raw.trim().toLowerCase()
    if (!token) continue

    if (token.startsWith("attr.")) {
      hints.push({
        key: raw,
        location: "groupBy",
        speed: "slow",
        reason: "Groups by Map column value",
      })
    } else if (token === "http.method") {
      hints.push({
        key: raw,
        location: "groupBy",
        speed: "slow",
        reason: "Reads from SpanAttributes Map column",
      })
    } else if (FAST_GROUP_BY_KEYS.has(token)) {
      hints.push({
        key: raw,
        location: "groupBy",
        speed: "fast",
        reason: "Uses native column",
      })
    }
  }

  return hints
}

export function hasSlowHints(hints: PerformanceHint[]): boolean {
  return hints.some((h) => h.speed === "slow")
}

export function slowHintsSummary(hints: PerformanceHint[]): string {
  const slow = hints.filter((h) => h.speed === "slow")
  if (slow.length === 0) return ""
  const keys = slow.map((h) => h.key).join(", ")
  return `Slow Map column access: ${keys}. These filters/groups scan the full attributes Map for every row.`
}
