import * as DateTime from "effect/DateTime"
import { Option } from "effect"

const formatUtc = (dt: DateTime.DateTime): string =>
  DateTime.formatIso(dt).replace("T", " ").slice(0, 19)

const alreadyNormalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

/**
 * Normalizes a time string to the `YYYY-MM-DD HH:mm:ss` UTC format expected
 * by Tinybird's `DateTime()` SQL function.
 *
 * Handles ISO 8601 (with T, Z, timezone offsets, milliseconds) and the
 * already-correct `YYYY-MM-DD HH:mm:ss` format. Returns the original string
 * unchanged if parsing fails.
 */
export function normalizeTime(input: string): string {
  const trimmed = input.trim()
  if (alreadyNormalized.test(trimmed)) return trimmed

  const parsed = DateTime.make(trimmed)
  if (Option.isSome(parsed)) return formatUtc(parsed.value)

  return trimmed
}

const DEFAULT_HOURS = 6

function defaultTimeRange(hours = DEFAULT_HOURS) {
  const now = DateTime.nowUnsafe()
  const start = DateTime.subtract(now, { hours })
  return {
    startTime: formatUtc(start),
    endTime: formatUtc(now),
  }
}

/**
 * Resolves the time range for an MCP tool call.
 * Normalizes user-provided values to UTC and falls back to a default window.
 */
export function resolveTimeRange(
  startTime: string | undefined,
  endTime: string | undefined,
  defaultHours: number = DEFAULT_HOURS,
): { st: string; et: string } {
  const defaults = defaultTimeRange(defaultHours)
  return {
    st: startTime ? normalizeTime(startTime) : defaults.startTime,
    et: endTime ? normalizeTime(endTime) : defaults.endTime,
  }
}
