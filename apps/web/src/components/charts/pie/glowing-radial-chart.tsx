"use client"

import { useId, useMemo, useState } from "react"
import { RadialBar, RadialBarChart } from "recharts"
import { ChartContainer } from "@/components/ui/chart"
import type { BaseChartProps } from "@/components/charts/_shared/chart-types"
import { buildChartConfig } from "@/components/charts/_shared/build-chart-config"
import { radialData } from "@/components/charts/_shared/sample-data"
import { GlowFilter } from "@/components/charts/_shared/svg-filters"

export function GlowingRadialChart({ data = radialData, className }: BaseChartProps) {
  const id = useId()
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const { config, data: coloredData } = useMemo(() => buildChartConfig(data), [data])

  const glowFilterIds = coloredData.map((_: unknown, i: number) => `radial-glow-${i}-${id}`)

  return (
    <ChartContainer config={config} className={className}>
      <RadialBarChart
        data={coloredData}
        innerRadius={30}
        outerRadius={110}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <defs>
          {glowFilterIds.map((filterId: string) => (
            <GlowFilter key={filterId} id={filterId} stdDeviation={4} />
          ))}
        </defs>
        <RadialBar
          dataKey="value"
          cornerRadius={10}
          background
          isAnimationActive={false}
          onMouseEnter={(_, index) => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
          style={
            hoveredIndex !== null
              ? { filter: `url(#${glowFilterIds[hoveredIndex]})` }
              : undefined
          }
        />
      </RadialBarChart>
    </ChartContainer>
  )
}
