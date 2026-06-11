import { describe, expect, it } from "vitest"

import { formatCellValue } from "./table-widget"

describe("formatCellValue", () => {
	it("formats percent cells from the canonical 0–1 ratio (matching formatValueByUnit)", () => {
		// Warehouse errorRate columns are 0–1 ratios; a 2.1% error rate arrives
		// as 0.021 and must render as "2.1%", not "0.0%".
		expect(formatCellValue(0.021, "percent")).toBe("2.1%")
		expect(formatCellValue(1, "percent")).toBe("100.0%")
		expect(formatCellValue(0, "percent")).toBe("0.0%")
	})

	it("leaves non-numeric and unitless values untouched", () => {
		expect(formatCellValue("checkout", "percent")).toBe("checkout")
		expect(formatCellValue(null, "percent")).toBe("-")
		expect(formatCellValue("raw", undefined)).toBe("raw")
	})
})
