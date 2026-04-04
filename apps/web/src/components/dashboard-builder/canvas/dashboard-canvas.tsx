import { memo, useCallback, useMemo } from "react"
import {
  GridLayout,
  useContainerWidth,
  verticalCompactor,
} from "react-grid-layout"
import type { Layout } from "react-grid-layout"
import "react-grid-layout/css/styles.css"

import type {
  WidgetDataState,
  DashboardWidget,
  WidgetDisplayConfig,
  WidgetMode,
} from "@/components/dashboard-builder/types"
import { useDashboardActions } from "@/components/dashboard-builder/dashboard-actions-context"
import { useWidgetData } from "@/hooks/use-widget-data"
import { ChartWidget } from "@/components/dashboard-builder/widgets/chart-widget"
import { StatWidget } from "@/components/dashboard-builder/widgets/stat-widget"
import { TableWidget } from "@/components/dashboard-builder/widgets/table-widget"
import { ListWidget } from "@/components/dashboard-builder/widgets/list-widget"

interface DashboardCanvasProps {
  widgets: DashboardWidget[]
}

const visualizationRegistry: Record<
  string,
  React.ComponentType<{
    dataState: WidgetDataState
    display: WidgetDisplayConfig
    mode: WidgetMode
    onRemove: () => void
    onClone?: () => void
    onConfigure?: () => void
  }>
> = {
  chart: ChartWidget,
  stat: StatWidget,
  table: TableWidget,
  list: ListWidget,
}

const WidgetRenderer = memo(function WidgetRenderer({
  widget,
}: {
  widget: DashboardWidget
}) {
  const { mode, readOnly, removeWidget, cloneWidget, configureWidget } =
    useDashboardActions()
  const { dataState } = useWidgetData(widget)
  const Visualization =
    visualizationRegistry[widget.visualization] ?? visualizationRegistry.chart

  const onRemove = useCallback(
    () => removeWidget(widget.id),
    [removeWidget, widget.id]
  )

  const onClone = useMemo(
    () => (readOnly ? undefined : () => cloneWidget(widget.id)),
    [readOnly, cloneWidget, widget.id]
  )

  const onConfigure = useMemo(
    () => (readOnly ? undefined : () => configureWidget(widget.id)),
    [readOnly, configureWidget, widget.id]
  )

  return (
    <Visualization
      dataState={dataState}
      display={widget.display}
      mode={mode}
      onRemove={onRemove}
      onClone={onClone}
      onConfigure={onConfigure}
    />
  )
})

export function DashboardCanvas({
  widgets,
}: DashboardCanvasProps) {
  const { mode, updateWidgetLayouts } = useDashboardActions()
  const { width, containerRef, mounted } = useContainerWidth()

  const layouts: Layout = widgets.map((w) => ({
    i: w.id,
    x: w.layout.x,
    y: w.layout.y,
    w: w.layout.w,
    h: w.layout.h,
    minW: w.layout.minW ?? 2,
    minH: w.layout.minH ?? 2,
    ...(w.layout.maxW != null ? { maxW: w.layout.maxW } : {}),
    ...(w.layout.maxH != null ? { maxH: w.layout.maxH } : {}),
  }))

  return (
    <div ref={containerRef}>
      {mounted && (
        <GridLayout
          width={width}
          layout={layouts}
          gridConfig={{
            cols: 12,
            rowHeight: 60,
            margin: [12, 12] as [number, number],
          }}
          dragConfig={{
            enabled: mode === "edit",
            handle: ".widget-drag-handle",
            bounded: false,
            threshold: 3,
          }}
          resizeConfig={{
            enabled: mode === "edit",
            handles: ["se"],
          }}
          compactor={verticalCompactor}
          onLayoutChange={(layout) =>
            updateWidgetLayouts(
              layout.map((l) => ({
                i: l.i,
                x: l.x,
                y: l.y,
                w: l.w,
                h: l.h,
              }))
            )
          }
        >
          {widgets.map((widget) => (
            <div key={widget.id}>
              <WidgetRenderer widget={widget} />
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  )
}
