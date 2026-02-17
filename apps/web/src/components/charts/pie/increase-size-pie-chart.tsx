"use client"

import { useMemo } from "react"
import { Cell, Pie, PieChart } from "recharts"
import { ChartContainer } from "@/components/ui/chart"
import type { BaseChartProps } from "@/components/charts/_shared/chart-types"
import { buildChartConfig } from "@/components/charts/_shared/build-chart-config"
import { pieData } from "@/components/charts/_shared/sample-data"

export function IncreaseSizePieChart({ data = pieData, className }: BaseChartProps) {
  const { config, data: coloredData } = useMemo(() => buildChartConfig(data), [data])

  const sorted = [...coloredData].sort(
    (a, b) => (b as { value: number }).value - (a as { value: number }).value
  )

  const baseOuterRadius = 60
  const radiusStep = 15

  return (
    <ChartContainer config={config} className={className}>
      <PieChart>
        {sorted.map((entry, index) => (
          <Pie
            key={index}
            data={[entry]}
            dataKey="value"
            nameKey="name"
            innerRadius={0}
            outerRadius={baseOuterRadius + index * radiusStep}
            isAnimationActive={false}
          >
            <Cell fill={(entry as { fill: string }).fill} />
          </Pie>
        ))}
      </PieChart>
    </ChartContainer>
  )
}
