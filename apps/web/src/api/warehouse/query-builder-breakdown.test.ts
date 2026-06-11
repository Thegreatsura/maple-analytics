import { describe, expect, it } from "vitest"

import * as breakdownModule from "@/api/warehouse/query-builder-breakdown"

describe("query-builder breakdown units", () => {
	it("does not rescale error_rate values — the engine's 0–1 ratio is canonical", () => {
		// Regression guard: a ÷100 "normalize" survived from the Tinybird-pipe
		// era (which returned percent points) long after the CH engine switched
		// to emitting ratios, making error_rate breakdowns 100× too small.
		expect(breakdownModule).not.toHaveProperty("__testables")
	})
})
