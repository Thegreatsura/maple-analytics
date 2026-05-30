import { Console, Effect } from "effect"
import { bold, dim } from "./style"

/**
 * Default output is pretty-printed JSON — readable for humans and trivially
 * parseable by agents/scripts piping the CLI. `--format table` (or
 * MAPLE_FORMAT=table) renders a flat row set as an aligned table, falling back
 * to JSON for nested/non-tabular results.
 */
export const printJson = (data: unknown) => Console.log(JSON.stringify(data, null, 2))

const resolveFormat = (): "json" | "table" => {
	const argv = typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv : []
	const i = argv.indexOf("--format")
	const value = i >= 0 ? argv[i + 1] : process.env.MAPLE_FORMAT
	return value === "table" ? "table" : "json"
}

const isPrimitive = (v: unknown): boolean =>
	v === null || v === undefined || ["string", "number", "boolean"].includes(typeof v)

const isFlatRow = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" &&
	v !== null &&
	!Array.isArray(v) &&
	Object.values(v as Record<string, unknown>).every(isPrimitive)

/** A non-empty array of flat rows: either `data` itself, or the sole array
 *  property of a wrapper object (e.g. `{ data: [...] }`). Null when nothing
 *  tabular is present — the caller then prints JSON. */
const tabularRows = (data: unknown): ReadonlyArray<Record<string, unknown>> | null => {
	if (Array.isArray(data)) return data.length > 0 && data.every(isFlatRow) ? data : null
	if (data && typeof data === "object") {
		const arrays = Object.values(data as Record<string, unknown>).filter(Array.isArray)
		if (arrays.length === 1 && arrays[0].length > 0 && arrays[0].every(isFlatRow)) {
			return arrays[0] as ReadonlyArray<Record<string, unknown>>
		}
	}
	return null
}

const cell = (v: unknown): string => (v === null || v === undefined ? "" : String(v))

const renderTable = (rows: ReadonlyArray<Record<string, unknown>>): string => {
	const cols: string[] = []
	for (const row of rows) for (const k of Object.keys(row)) if (!cols.includes(k)) cols.push(k)
	const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)))
	const pad = (s: string, w: number): string => s + " ".repeat(Math.max(0, w - s.length))
	const header = cols.map((c, i) => bold(pad(c, widths[i]))).join("  ")
	const rule = dim(cols.map((_, i) => "─".repeat(widths[i])).join("  "))
	const body = rows.map((r) => cols.map((c, i) => pad(cell(r[c]), widths[i])).join("  ")).join("\n")
	return `${header}\n${rule}\n${body}`
}

/** Format-aware result printer (default JSON, `--format table` when tabular). */
export const printResult = (data: unknown): Effect.Effect<void> =>
	Effect.sync(() => {
		if (resolveFormat() === "table") {
			const rows = tabularRows(data)
			if (rows) {
				process.stdout.write(`${renderTable(rows)}\n`)
				return
			}
			process.stderr.write(dim("(--format table: result isn't a flat row set — showing JSON)\n"))
		}
		process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
	})
