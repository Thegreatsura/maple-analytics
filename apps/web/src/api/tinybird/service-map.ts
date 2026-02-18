import { getTinybird, type ServiceDependenciesOutput } from "@/lib/tinybird"
import { estimateThroughput } from "@/lib/sampling"

export interface ServiceEdge {
  sourceService: string
  targetService: string
  callCount: number
  estimatedCallCount: number
  errorCount: number
  errorRate: number
  avgDurationMs: number
  p95DurationMs: number
  hasSampling: boolean
  samplingWeight: number
}

export interface ServiceMapResponse {
  edges: ServiceEdge[]
  error: string | null
}

export interface GetServiceMapInput {
  startTime?: string
  endTime?: string
  deploymentEnv?: string
}

function transformEdge(row: ServiceDependenciesOutput, durationSeconds: number): ServiceEdge {
  const callCount = Number(row.callCount)
  const errorCount = Number(row.errorCount)
  const sampledSpanCount = Number(row.sampledSpanCount)
  const unsampledSpanCount = Number(row.unsampledSpanCount)
  const threshold = row.dominantThreshold || ""
  const sampling = estimateThroughput(sampledSpanCount, unsampledSpanCount, threshold, durationSeconds)
  const estimatedCallCount = sampling.hasSampling
    ? Math.round(sampling.estimated * durationSeconds)
    : callCount
  return {
    sourceService: row.sourceService,
    targetService: row.targetService,
    callCount,
    estimatedCallCount,
    errorCount,
    errorRate: callCount > 0 ? (errorCount / callCount) * 100 : 0,
    avgDurationMs: Number(row.avgDurationMs),
    p95DurationMs: Number(row.p95DurationMs),
    hasSampling: sampling.hasSampling,
    samplingWeight: sampling.weight,
  }
}

export async function getServiceMap({
  data,
}: {
  data: GetServiceMapInput
}): Promise<ServiceMapResponse> {
  try {
    const tinybird = getTinybird()
    const result = await tinybird.query.service_dependencies({
      start_time: data.startTime,
      end_time: data.endTime,
      deployment_env: data.deploymentEnv,
    })

    const startMs = data.startTime
      ? new Date(data.startTime.replace(" ", "T") + "Z").getTime()
      : 0
    const endMs = data.endTime
      ? new Date(data.endTime.replace(" ", "T") + "Z").getTime()
      : 0
    const durationSeconds =
      startMs > 0 && endMs > 0
        ? Math.max((endMs - startMs) / 1000, 1)
        : 3600

    return {
      edges: result.data.map((row) => transformEdge(row, durationSeconds)),
      error: null,
    }
  } catch (error) {
    console.error("[Tinybird] getServiceMap failed:", error)
    return {
      edges: [],
      error: error instanceof Error ? error.message : "Failed to fetch service map",
    }
  }
}
