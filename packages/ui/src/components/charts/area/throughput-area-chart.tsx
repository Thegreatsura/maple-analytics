import { useMemo, useId } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import type { BaseChartProps } from "../_shared/chart-types"
import { throughputTimeSeriesData } from "../_shared/sample-data"
import { VerticalGradient } from "../_shared/svg-patterns"
import { useIncompleteSegments, extendConfigWithIncomplete } from "../_shared/use-incomplete-segments"
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "../../ui/chart"
import { inferBucketSeconds, inferRangeMs, formatBucketLabel, bucketIntervalLabel, formatThroughput } from "../../../lib/format"

const VALUE_KEYS = ["throughput"]

export function ThroughputAreaChart({ data, className, legend, tooltip, rateMode }: BaseChartProps) {
  const id = useId()
  const gradientId = `throughputGradient-${id.replace(/:/g, "")}`
  const fadedGradientId = `throughputGradientFaded-${id.replace(/:/g, "")}`
  const chartData = data ?? throughputTimeSeriesData
  const perSecond = rateMode === "per_second"

  const bucketSeconds = useMemo(
    () => inferBucketSeconds(chartData as Array<{ bucket: string }>),
    [chartData],
  )

  const rateLabel = useMemo(
    () => (perSecond ? "/s" : bucketIntervalLabel(bucketSeconds)),
    [perSecond, bucketSeconds],
  )

  const axisContext = useMemo(
    () => ({
      rangeMs: inferRangeMs(chartData as Array<Record<string, unknown>>),
      bucketSeconds,
    }),
    [chartData, bucketSeconds],
  )

  const { data: processedData, hasIncomplete, incompleteKeys } = useIncompleteSegments(chartData, VALUE_KEYS)

  // Normalize throughput values to per-second rate when rateMode is "per_second"
  const displayData = useMemo(() => {
    if (!perSecond || !bucketSeconds) return processedData
    return processedData.map((point) => ({
      ...point,
      throughput: point.throughput != null ? Number(point.throughput) / bucketSeconds : point.throughput,
      throughput_incomplete: point.throughput_incomplete != null ? Number(point.throughput_incomplete) / bucketSeconds : point.throughput_incomplete,
    }))
  }, [processedData, perSecond, bucketSeconds])

  const chartConfig = useMemo(
    () =>
      extendConfigWithIncomplete(
        {
          throughput: {
            label: rateLabel ? `Throughput (${rateLabel})` : "Throughput",
            color: "var(--chart-throughput)",
          },
        } satisfies ChartConfig,
        incompleteKeys,
      ),
    [rateLabel, incompleteKeys],
  )

  return (
    <ChartContainer config={chartConfig} className={className}>
      <AreaChart data={displayData} accessibilityLayer>
        <defs>
          <VerticalGradient id={gradientId} color="var(--color-throughput)" />
          {hasIncomplete && (
            <VerticalGradient id={fadedGradientId} color="var(--color-throughput)" startOpacity={0.15} endOpacity={0} />
          )}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="bucket"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(v) => formatBucketLabel(v, axisContext, "tick")}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={rateLabel.length > 3 ? 90 : 60}
          tickFormatter={(value: number) => formatThroughput(value, rateLabel)}
        />
        {tooltip !== "hidden" && (
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  if (!payload?.[0]?.payload?.bucket) return ""
                  return formatBucketLabel(payload[0].payload.bucket, axisContext, "tooltip")
                }}
                formatter={(value, name, item) => {
                  const nameStr = String(name)
                  const isIncomplete = nameStr.endsWith("_incomplete")
                  const baseKey = isIncomplete ? nameStr.replace(/_incomplete$/, "") : nameStr
                  if (isIncomplete && item.payload?.[baseKey] != null) return null
                  if (!isIncomplete && value == null) return null
                  return (
                    <span className="flex items-center gap-2">
                      <span
                        className="shrink-0 size-2.5 rounded-[2px]"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-muted-foreground">Throughput</span>
                      <span className="font-mono font-medium">
                        {Number(value).toLocaleString()}{rateLabel}
                      </span>
                    </span>
                  )
                }}
              />
            }
          />
        )}
        {legend === "visible" && <ChartLegend content={<ChartLegendContent />} />}
        <Area
          type="linear"
          dataKey="throughput"
          stroke="var(--color-throughput)"
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
        />
        {hasIncomplete && (
          <Area
            type="linear"
            dataKey="throughput_incomplete"
            stroke="var(--color-throughput)"
            fill={`url(#${fadedGradientId})`}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
            legendType="none"
            isAnimationActive={false}
          />
        )}
      </AreaChart>
    </ChartContainer>
  )
}
