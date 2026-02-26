import type { BaseComponentProps } from "@json-render/react"
import { cn } from "@maple/ui/utils"
import { formatDuration } from "@/lib/format"

interface TraceListProps {
  traces: Array<{
    traceId: string
    rootSpanName: string
    durationMs: number
    spanCount: number
    services: string[]
    hasError: boolean
    startTime?: string
    errorMessage?: string
  }>
  stats?: {
    p50Ms: number
    p95Ms: number
    minMs: number
    maxMs: number
  }
}

export function TraceList({ props }: BaseComponentProps<TraceListProps>) {
  const { traces, stats } = props

  return (
    <div className="space-y-1.5">
      {stats && (
        <div className="flex gap-3 text-[10px] text-muted-foreground">
          <span>P50: {formatDuration(stats.p50Ms)}</span>
          <span>P95: {formatDuration(stats.p95Ms)}</span>
          <span>Min: {formatDuration(stats.minMs)}</span>
          <span>Max: {formatDuration(stats.maxMs)}</span>
        </div>
      )}
      <div className="max-h-[300px] overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border/40 text-left text-muted-foreground">
              <th className="pb-1 pr-2 font-medium">Trace ID</th>
              <th className="pb-1 pr-2 font-medium">Root Span</th>
              <th className="pb-1 pr-2 font-medium text-right">Duration</th>
              <th className="pb-1 pr-2 font-medium text-right">Spans</th>
              <th className="pb-1 font-medium">Services</th>
            </tr>
          </thead>
          <tbody>
            {traces.map((trace) => (
              <tr
                key={trace.traceId}
                className="border-b border-border/20 last:border-0"
              >
                <td className="py-1 pr-2">
                  <a
                    href={`/traces/${trace.traceId}`}
                    className="font-mono text-blue-400 hover:underline"
                  >
                    {trace.traceId.slice(0, 12)}
                  </a>
                  {trace.hasError && (
                    <span className="ml-1 inline-block size-1.5 rounded-full bg-red-500" />
                  )}
                </td>
                <td className="max-w-[160px] truncate py-1 pr-2">
                  {trace.rootSpanName}
                </td>
                <td
                  className={cn(
                    "py-1 pr-2 text-right font-mono",
                    trace.durationMs > 1000 && "text-yellow-500",
                    trace.durationMs > 5000 && "text-red-500"
                  )}
                >
                  {formatDuration(trace.durationMs)}
                </td>
                <td className="py-1 pr-2 text-right text-muted-foreground">
                  {trace.spanCount}
                </td>
                <td className="py-1">
                  <div className="flex flex-wrap gap-1">
                    {trace.services.slice(0, 3).map((svc) => (
                      <span
                        key={svc}
                        className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {svc}
                      </span>
                    ))}
                    {trace.services.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{trace.services.length - 3}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
