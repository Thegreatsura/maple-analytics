import { describe, expect, it } from "bun:test"
import { normalizeTime, resolveTimeRange } from "./time"

describe("normalizeTime", () => {
  it("passes through already-correct format", () => {
    expect(normalizeTime("2026-03-30 14:30:00")).toBe("2026-03-30 14:30:00")
  })

  it("converts ISO 8601 with Z", () => {
    expect(normalizeTime("2026-03-30T14:30:00Z")).toBe("2026-03-30 14:30:00")
  })

  it("converts ISO 8601 with milliseconds", () => {
    expect(normalizeTime("2026-03-30T14:30:00.000Z")).toBe("2026-03-30 14:30:00")
  })

  it("converts ISO 8601 with positive timezone offset to UTC", () => {
    expect(normalizeTime("2026-03-30T14:30:00+09:00")).toBe("2026-03-30 05:30:00")
  })

  it("converts ISO 8601 with negative timezone offset to UTC", () => {
    expect(normalizeTime("2026-03-30T14:30:00-05:00")).toBe("2026-03-30 19:30:00")
  })

  it("handles date rollover on UTC conversion", () => {
    expect(normalizeTime("2026-03-30T00:00:00+09:00")).toBe("2026-03-29 15:00:00")
  })

  it("returns unparseable strings as-is", () => {
    expect(normalizeTime("not-a-date")).toBe("not-a-date")
  })

  it("trims whitespace", () => {
    expect(normalizeTime("  2026-03-30 14:30:00  ")).toBe("2026-03-30 14:30:00")
  })
})

describe("resolveTimeRange", () => {
  it("normalizes both provided values", () => {
    const { st, et } = resolveTimeRange("2026-03-30T10:00:00Z", "2026-03-30T16:00:00Z")
    expect(st).toBe("2026-03-30 10:00:00")
    expect(et).toBe("2026-03-30 16:00:00")
  })

  it("returns default window when neither is provided", () => {
    const { st, et } = resolveTimeRange(undefined, undefined)
    // Both should match YYYY-MM-DD HH:mm:ss format
    expect(st).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(et).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    // Default window is 6 hours
    const startMs = new Date(st.replace(" ", "T") + "Z").getTime()
    const endMs = new Date(et.replace(" ", "T") + "Z").getTime()
    const diffHours = (endMs - startMs) / (1000 * 60 * 60)
    expect(diffHours).toBeCloseTo(6, 0)
  })

  it("normalizes start and uses default end when only start provided", () => {
    const { st, et } = resolveTimeRange("2026-03-30T10:00:00+09:00", undefined)
    expect(st).toBe("2026-03-30 01:00:00")
    expect(et).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it("uses default start and normalizes end when only end provided", () => {
    const { st, et } = resolveTimeRange(undefined, "2026-03-30T16:00:00Z")
    expect(st).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(et).toBe("2026-03-30 16:00:00")
  })
})
