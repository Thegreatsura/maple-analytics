export interface PlanLimits {
  logsGB: number
  tracesGB: number
  metricsGB: number
  retentionDays: number
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { logsGB: 10, tracesGB: 10, metricsGB: 10, retentionDays: 7 },
  startup: { logsGB: 40, tracesGB: 40, metricsGB: 40, retentionDays: 30 },
}

const DEFAULT_PLAN = "free"

export function getPlanLimits(planSlug: string | undefined): PlanLimits {
  return PLAN_LIMITS[planSlug ?? DEFAULT_PLAN] ?? PLAN_LIMITS[DEFAULT_PLAN]
}
