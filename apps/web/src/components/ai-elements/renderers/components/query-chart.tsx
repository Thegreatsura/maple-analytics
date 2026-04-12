import { useMemo, useId } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import type { BaseComponentProps } from "@json-render/react"
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@maple/ui/components/ui/chart"
import { VerticalGradient } from "@maple/ui/components/charts/_shared/svg-patterns"
import { getSemanticSeriesColor } from "@maple/ui/lib/semantic-series-colors"
import { formatValueByUnit, formatBucketLabel, inferBucketSeconds, inferRangeMs } from "@maple/ui/lib/format"

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

interface QueryChartProps {
  data: Array<{ bucket: string; series: Record<string, number> }>
  metric: string
  unit: string
  source: string
  groupBy?: string
}

export function QueryChart({ props }: BaseComponentProps<QueryChartProps>) {
  const { data, metric, unit } = props
  const id = useId()
  const cleanId = id.replace(/:/g, "")

  const seriesKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const point of data) {
      for (const key of Object.keys(point.series)) {
        keys.add(key)
      }
    }
    return Array.from(keys)
  }, [data])

  const chartData = useMemo(
    () => data.map((point) => ({ bucket: point.bucket, ...point.series })),
    [data],
  )

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {}
    for (let i = 0; i < seriesKeys.length; i++) {
      const key = seriesKeys[i]
      config[key] = {
        label: key,
        color: getSemanticSeriesColor(key) ?? CHART_COLORS[i % CHART_COLORS.length],
      }
    }
    return config
  }, [seriesKeys])

  const axisContext = useMemo(
    () => ({
      rangeMs: inferRangeMs(chartData as Array<Record<string, unknown>>),
      bucketSeconds: inferBucketSeconds(chartData as Array<{ bucket: string }>),
    }),
    [chartData],
  )

  if (data.length === 0) {
    return (
      <div className="flex h-[140px] items-center justify-center text-[11px] text-muted-foreground">
        No data points
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground">{metric}</p>
      <ChartContainer config={chartConfig} className="h-[140px] w-full">
        <AreaChart data={chartData} accessibilityLayer>
          <defs>
            {seriesKeys.map((key, i) => (
              <VerticalGradient
                key={key}
                id={`gradient-${cleanId}-${i}`}
                color={`var(--color-${key})`}
              />
            ))}
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
            tickMargin={4}
            width={50}
            tickFormatter={(value: number) => formatValueByUnit(value, unit)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  if (!payload?.[0]?.payload?.bucket) return ""
                  return formatBucketLabel(
                    payload[0].payload.bucket as string,
                    axisContext,
                    "tooltip",
                  )
                }}
                formatter={(value) => formatValueByUnit(Number(value), unit)}
              />
            }
          />
          {seriesKeys.map((key, i) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stroke={`var(--color-${key})`}
              fill={`url(#gradient-${cleanId}-${i})`}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
