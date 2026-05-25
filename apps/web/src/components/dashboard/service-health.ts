import type { SeverityLevel } from "@/components/infra/format"
import type { AlertIncidentDocument } from "@maple/domain/http"

/** Health rollup for a single service, combining golden-signal metrics with live alerts. */
export type ServiceHealth = "healthy" | "degraded" | "unhealthy"

// Thresholds are intentionally simple, named constants so they're easy to tune
// without hunting through JSX. Error rate is a fraction (errors / requests);
// p95 is in milliseconds.
const ERROR_RATE_DEGRADED = 0.01 // 1%
const ERROR_RATE_UNHEALTHY = 0.05 // 5%
const P95_DEGRADED_MS = 1_000
const P95_UNHEALTHY_MS = 3_000

interface ServiceSignals {
	errorRate: number
	p95LatencyMs: number
}

/**
 * Derive a service's health. An open alert incident always forces `unhealthy`
 * — an operator has explicitly decided this service is in a bad state, so it
 * outranks any threshold heuristic.
 */
export function deriveServiceHealth(signals: ServiceSignals, hasOpenIncident: boolean): ServiceHealth {
	if (hasOpenIncident) return "unhealthy"
	if (signals.errorRate >= ERROR_RATE_UNHEALTHY || signals.p95LatencyMs >= P95_UNHEALTHY_MS) {
		return "unhealthy"
	}
	if (signals.errorRate >= ERROR_RATE_DEGRADED || signals.p95LatencyMs >= P95_DEGRADED_MS) {
		return "degraded"
	}
	return "healthy"
}

/** Severity of an error-rate value on its own (independent of latency). */
export function errorRateTone(errorRate: number): SeverityLevel {
	if (errorRate >= ERROR_RATE_UNHEALTHY) return "crit"
	if (errorRate >= ERROR_RATE_DEGRADED) return "warn"
	return "ok"
}

/** Severity of a p95 latency value on its own (independent of error rate). */
export function latencyTone(p95LatencyMs: number): SeverityLevel {
	if (p95LatencyMs >= P95_UNHEALTHY_MS) return "crit"
	if (p95LatencyMs >= P95_DEGRADED_MS) return "warn"
	return "ok"
}

/** Map a health level onto the `StatRail`/severity tone vocabulary. */
export function healthToTone(health: ServiceHealth): SeverityLevel {
	switch (health) {
		case "unhealthy":
			return "crit"
		case "degraded":
			return "warn"
		case "healthy":
			return "ok"
	}
}

// Higher = worse; used to sort the most-broken services to the top.
const HEALTH_RANK: Record<ServiceHealth, number> = {
	unhealthy: 2,
	degraded: 1,
	healthy: 0,
}

export function healthRank(health: ServiceHealth): number {
	return HEALTH_RANK[health]
}

// Only the fields the matcher reads — keeps the function testable without
// constructing a full branded `AlertIncidentDocument`.
type IncidentMatchFields = Pick<AlertIncidentDocument, "status" | "groupKey">

/**
 * Best-effort match of an open incident to a service. When an alert rule groups
 * by service, the incident's `groupKey` is the service name. Incidents without
 * a per-service group key (rule spanning many services) won't match here — the
 * org-wide firing count in the banner still counts them exactly.
 */
export function incidentMatchesService(incident: IncidentMatchFields, serviceName: string): boolean {
	return incident.status === "open" && incident.groupKey === serviceName
}
