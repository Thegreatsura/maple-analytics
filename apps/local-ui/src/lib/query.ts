// SPA-side wrapper around the shared `executeLocalQuery` client. The shared
// client (`@maple/query-engine/local`) is environment-agnostic and takes an
// explicit base URL; here we resolve it from the page origin so the same build
// works whether it's served same-origin by the binary (`--offline` / dev proxy)
// or remotely from `local.maple.dev`. Hooks import `executeLocalQuery` from here
// instead of the shared package so they never have to thread the base URL.
import { executeLocalQuery as run } from "@maple/query-engine/local"
import { localApiBase } from "./constants"

export function executeLocalQuery<T = Record<string, unknown>>(
	sql: string,
	signal?: AbortSignal,
): Promise<T[]> {
	return run<T>(sql, localApiBase(), signal)
}
