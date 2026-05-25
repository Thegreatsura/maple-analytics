import { describe, expect, it } from "vitest"

import {
	deriveServiceHealth,
	errorRateTone,
	healthRank,
	healthToTone,
	incidentMatchesService,
	latencyTone,
} from "./service-health"

describe("deriveServiceHealth", () => {
	it("is healthy when error rate and latency are low", () => {
		expect(deriveServiceHealth({ errorRate: 0.002, p95LatencyMs: 120 }, false)).toBe("healthy")
	})

	it("is degraded at the error-rate warn threshold", () => {
		expect(deriveServiceHealth({ errorRate: 0.01, p95LatencyMs: 120 }, false)).toBe("degraded")
	})

	it("is degraded at the p95 warn threshold", () => {
		expect(deriveServiceHealth({ errorRate: 0, p95LatencyMs: 1_000 }, false)).toBe("degraded")
	})

	it("is unhealthy at the error-rate crit threshold", () => {
		expect(deriveServiceHealth({ errorRate: 0.05, p95LatencyMs: 120 }, false)).toBe("unhealthy")
	})

	it("is unhealthy at the p95 crit threshold", () => {
		expect(deriveServiceHealth({ errorRate: 0, p95LatencyMs: 3_000 }, false)).toBe("unhealthy")
	})

	it("forces unhealthy when an incident is open, regardless of metrics", () => {
		expect(deriveServiceHealth({ errorRate: 0, p95LatencyMs: 1 }, true)).toBe("unhealthy")
	})
})

describe("healthToTone", () => {
	it("maps health levels onto severity tones", () => {
		expect(healthToTone("healthy")).toBe("ok")
		expect(healthToTone("degraded")).toBe("warn")
		expect(healthToTone("unhealthy")).toBe("crit")
	})
})

describe("per-metric tones", () => {
	it("tones error rate by its own thresholds", () => {
		expect(errorRateTone(0.005)).toBe("ok")
		expect(errorRateTone(0.01)).toBe("warn")
		expect(errorRateTone(0.05)).toBe("crit")
	})

	it("tones p95 latency by its own thresholds", () => {
		expect(latencyTone(500)).toBe("ok")
		expect(latencyTone(1_000)).toBe("warn")
		expect(latencyTone(3_000)).toBe("crit")
	})
})

describe("healthRank", () => {
	it("ranks worse health higher so it sorts first", () => {
		expect(healthRank("unhealthy")).toBeGreaterThan(healthRank("degraded"))
		expect(healthRank("degraded")).toBeGreaterThan(healthRank("healthy"))
	})
})

describe("incidentMatchesService", () => {
	it("matches an open incident whose groupKey is the service name", () => {
		expect(incidentMatchesService({ status: "open", groupKey: "checkout" }, "checkout")).toBe(true)
	})

	it("does not match a resolved incident", () => {
		expect(incidentMatchesService({ status: "resolved", groupKey: "checkout" }, "checkout")).toBe(false)
	})

	it("does not match an incident for a different service", () => {
		expect(incidentMatchesService({ status: "open", groupKey: "billing" }, "checkout")).toBe(false)
	})

	it("does not match an incident without a group key", () => {
		expect(incidentMatchesService({ status: "open", groupKey: null }, "checkout")).toBe(false)
	})
})
