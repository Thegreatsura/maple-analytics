import { beforeEach, assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { vi } from "vitest"

const executeQueryEngineMock = vi.fn()

vi.mock("@/api/warehouse/effect-utils", async () => {
	const actual = await vi.importActual<typeof import("@/api/warehouse/effect-utils")>(
		"@/api/warehouse/effect-utils",
	)
	return {
		...actual,
		executeQueryEngine: (...args: unknown[]) => executeQueryEngineMock(...args),
	}
})

import { getOverviewTimeSeries } from "@/api/warehouse/custom-charts"

describe("querySpanMetricsCalls", () => {
	beforeEach(() => {
		executeQueryEngineMock.mockReset()
		executeQueryEngineMock.mockImplementation(() =>
			Effect.succeed({ result: { kind: "timeseries", data: [] } }),
		)
	})

	it.effect("queries the monotonic SpanMetrics `calls` counter as a per-bucket increase, not raw sum", () =>
		Effect.gen(function* () {
			yield* getOverviewTimeSeries({
				data: {
					startTime: "2026-02-01 00:00:00",
					endTime: "2026-02-01 01:00:00",
				},
			})

			const spanMetricsCalls = executeQueryEngineMock.mock.calls.filter(
				(call) => call[0] === "queryEngine.spanMetricsCalls",
			)

			assert.isAbove(spanMetricsCalls.length, 0)
			for (const [, request] of spanMetricsCalls) {
				assert.strictEqual(request.query.metric, "increase")
			}
		}),
	)
})
