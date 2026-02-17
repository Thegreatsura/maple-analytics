import { useAtomSet } from "@effect-atom/atom-react"
import { useCallback, useEffect, useState } from "react"
import { Exit } from "effect"
import { MapleApiAtomClient } from "@/lib/services/common/atom-client"
import type {
  Dashboard,
  DashboardVariable,
  DashboardWidget,
  TimeRange,
  VisualizationType,
  WidgetDataSource,
  WidgetDisplayConfig,
} from "@/components/dashboard-builder/types"

const GRID_COLS = 12

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function findNextPosition(
  widgets: DashboardWidget[],
  newWidth: number,
): { x: number; y: number } {
  if (widgets.length === 0) {
    return { x: 0, y: 0 }
  }

  const maxY = Math.max(...widgets.map((w) => w.layout.y))
  const bottomRowWidgets = widgets.filter((w) => w.layout.y === maxY)
  const rightEdge = Math.max(
    ...bottomRowWidgets.map((w) => w.layout.x + w.layout.w),
  )

  if (rightEdge + newWidth <= GRID_COLS) {
    return { x: rightEdge, y: maxY }
  }

  const maxBottom = Math.max(
    ...widgets.map((w) => w.layout.y + w.layout.h),
  )
  return { x: 0, y: maxBottom }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return "Dashboard persistence is temporarily unavailable"
}

function ensureDashboard(value: unknown): Dashboard | null {
  if (typeof value !== "object" || value === null) {
    return null
  }

  const dashboard = value as Partial<Dashboard>

  if (
    typeof dashboard.id !== "string" ||
    typeof dashboard.name !== "string" ||
    !Array.isArray(dashboard.widgets) ||
    typeof dashboard.createdAt !== "string" ||
    typeof dashboard.updatedAt !== "string" ||
    typeof dashboard.timeRange !== "object" ||
    dashboard.timeRange === null
  ) {
    return null
  }

  return dashboard as Dashboard
}

export function useDashboardStore() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [readOnly, setReadOnly] = useState(false)
  const [persistenceError, setPersistenceError] = useState<string | null>(null)

  const listMutation = useAtomSet(MapleApiAtomClient.mutation("dashboards", "list"), { mode: "promiseExit" })
  const upsertMutation = useAtomSet(MapleApiAtomClient.mutation("dashboards", "upsert"), { mode: "promiseExit" })
  const deleteMutation = useAtomSet(MapleApiAtomClient.mutation("dashboards", "delete"), { mode: "promiseExit" })

  const setPersistenceFailure = useCallback((error: unknown) => {
    setReadOnly(true)
    setPersistenceError(getErrorMessage(error))
  }, [])

  const persistUpsert = useCallback(
    (rollback: Dashboard[], dashboard: Dashboard) => {
      void upsertMutation({
        path: { dashboardId: dashboard.id },
        payload: { dashboard },
      }).then((result) => {
        if (Exit.isFailure(result)) {
          setDashboards(rollback)
          setPersistenceFailure(result)
        }
      })
    },
    [upsertMutation, setPersistenceFailure],
  )

  const persistDelete = useCallback(
    (rollback: Dashboard[], dashboardId: string) => {
      void deleteMutation({ path: { dashboardId } }).then((result) => {
        if (Exit.isFailure(result)) {
          setDashboards(rollback)
          setPersistenceFailure(result)
        }
      })
    },
    [deleteMutation, setPersistenceFailure],
  )

  const mutateDashboard = useCallback(
    (
      dashboardId: string,
      updater: (dashboard: Dashboard) => Dashboard,
    ) => {
      if (readOnly) return

      setDashboards((previous) => {
        const index = previous.findIndex((dashboard) => dashboard.id === dashboardId)
        if (index < 0) return previous

        const current = previous[index]
        const updated = updater(current)
        const next = [...previous]
        next[index] = updated

        persistUpsert(previous, updated)
        return next
      })
    },
    [persistUpsert, readOnly],
  )

  useEffect(() => {
    let cancelled = false

    const loadDashboards = async () => {
      setIsLoading(true)

      const result = await listMutation({})
      if (cancelled) return

      if (Exit.isSuccess(result)) {
        const nextDashboards = result.value.dashboards
          .map((dashboard) => ensureDashboard(dashboard))
          .filter((dashboard): dashboard is Dashboard => dashboard !== null)

        setDashboards(nextDashboards)
        setReadOnly(false)
        setPersistenceError(null)
      } else {
        setPersistenceFailure(result)
      }

      if (!cancelled) {
        setIsLoading(false)
      }
    }

    void loadDashboards()

    return () => {
      cancelled = true
    }
  }, [listMutation, setPersistenceFailure])

  const createDashboard = useCallback(
    (name: string): Dashboard => {
      if (readOnly) {
        throw new Error("Dashboards are read-only")
      }

      const now = new Date().toISOString()
      const dashboard: Dashboard = {
        id: generateId(),
        name,
        timeRange: { type: "relative", value: "12h" },
        createdAt: now,
        updatedAt: now,
        widgets: [],
      }

      setDashboards((previous) => {
        const next = [...previous, dashboard]
        persistUpsert(previous, dashboard)
        return next
      })

      return dashboard
    },
    [persistUpsert, readOnly],
  )

  const updateDashboard = useCallback(
    (
      id: string,
      updates: Partial<Pick<Dashboard, "name" | "description" | "tags">>,
    ) => {
      mutateDashboard(id, (dashboard) => ({
        ...dashboard,
        ...updates,
        updatedAt: new Date().toISOString(),
      }))
    },
    [mutateDashboard],
  )

  const deleteDashboard = useCallback(
    (id: string) => {
      if (readOnly) return

      setDashboards((previous) => {
        const next = previous.filter((dashboard) => dashboard.id !== id)
        if (next.length === previous.length) return previous

        persistDelete(previous, id)
        return next
      })
    },
    [persistDelete, readOnly],
  )

  const updateDashboardTimeRange = useCallback(
    (id: string, timeRange: TimeRange) => {
      mutateDashboard(id, (dashboard) => ({
        ...dashboard,
        timeRange,
        updatedAt: new Date().toISOString(),
      }))
    },
    [mutateDashboard],
  )

  const updateDashboardVariables = useCallback(
    (id: string, variables: DashboardVariable[]) => {
      mutateDashboard(id, (dashboard) => ({
        ...dashboard,
        variables,
        updatedAt: new Date().toISOString(),
      }))
    },
    [mutateDashboard],
  )

  const addWidget = useCallback(
    (
      dashboardId: string,
      visualization: VisualizationType,
      dataSource: WidgetDataSource,
      display: WidgetDisplayConfig,
    ): DashboardWidget => {
      if (readOnly) {
        throw new Error("Dashboards are read-only")
      }

      const layoutDefaults =
        visualization === "stat"
          ? { w: 3, h: 4, minW: 2, minH: 2 }
          : visualization === "table"
            ? { w: 6, h: 4, minW: 3, minH: 3 }
            : { w: 4, h: 4, minW: 2, minH: 2 }

      const widgetId = generateId()
      let widgetRef: DashboardWidget | null = null

      mutateDashboard(dashboardId, (dashboard) => {
        const position = findNextPosition(dashboard.widgets, layoutDefaults.w)

        const widget: DashboardWidget = {
          id: widgetId,
          visualization,
          dataSource,
          display,
          layout: { ...position, ...layoutDefaults },
        }

        widgetRef = widget

        return {
          ...dashboard,
          widgets: [...dashboard.widgets, widget],
          updatedAt: new Date().toISOString(),
        }
      })

      return widgetRef!
    },
    [mutateDashboard, readOnly],
  )

  const removeWidget = useCallback(
    (dashboardId: string, widgetId: string) => {
      mutateDashboard(dashboardId, (dashboard) => ({
        ...dashboard,
        widgets: dashboard.widgets.filter((widget) => widget.id !== widgetId),
        updatedAt: new Date().toISOString(),
      }))
    },
    [mutateDashboard],
  )

  const updateWidgetDataSource = useCallback(
    (dashboardId: string, widgetId: string, dataSource: WidgetDataSource) => {
      mutateDashboard(dashboardId, (dashboard) => ({
        ...dashboard,
        widgets: dashboard.widgets.map((widget) =>
          widget.id === widgetId ? { ...widget, dataSource } : widget,
        ),
        updatedAt: new Date().toISOString(),
      }))
    },
    [mutateDashboard],
  )

  const updateWidgetDisplay = useCallback(
    (
      dashboardId: string,
      widgetId: string,
      display: Partial<WidgetDisplayConfig>,
    ) => {
      mutateDashboard(dashboardId, (dashboard) => ({
        ...dashboard,
        widgets: dashboard.widgets.map((widget) =>
          widget.id === widgetId
            ? { ...widget, display: { ...widget.display, ...display } }
            : widget,
        ),
        updatedAt: new Date().toISOString(),
      }))
    },
    [mutateDashboard],
  )

  const updateWidgetLayouts = useCallback(
    (
      dashboardId: string,
      layouts: Array<{ i: string; x: number; y: number; w: number; h: number }>,
    ) => {
      mutateDashboard(dashboardId, (dashboard) => ({
        ...dashboard,
        widgets: dashboard.widgets.map((widget) => {
          const layout = layouts.find((item) => item.i === widget.id)
          if (!layout) return widget

          return {
            ...widget,
            layout: {
              ...widget.layout,
              x: layout.x,
              y: layout.y,
              w: layout.w,
              h: layout.h,
            },
          }
        }),
        updatedAt: new Date().toISOString(),
      }))
    },
    [mutateDashboard],
  )

  const updateWidget = useCallback(
    (
      dashboardId: string,
      widgetId: string,
      updates: Partial<
        Pick<
          DashboardWidget,
          "visualization" | "dataSource" | "display" | "layout" | "timeRangeOverride"
        >
      >,
    ) => {
      mutateDashboard(dashboardId, (dashboard) => ({
        ...dashboard,
        widgets: dashboard.widgets.map((widget) =>
          widget.id === widgetId ? { ...widget, ...updates } : widget,
        ),
        updatedAt: new Date().toISOString(),
      }))
    },
    [mutateDashboard],
  )

  const autoLayoutWidgets = useCallback(
    (dashboardId: string) => {
      mutateDashboard(dashboardId, (dashboard) => {
        if (dashboard.widgets.length === 0) return dashboard

        const sorted = [...dashboard.widgets].sort((a, b) => {
          if (a.layout.y !== b.layout.y) return a.layout.y - b.layout.y
          return a.layout.x - b.layout.x
        })

        let currentX = 0
        let currentY = 0
        let rowHeight = 0

        const relaid = sorted.map((widget) => {
          const w = widget.layout.w
          const h = widget.layout.h

          if (currentX + w > GRID_COLS) {
            currentX = 0
            currentY += rowHeight
            rowHeight = 0
          }

          const newLayout = { ...widget.layout, x: currentX, y: currentY }
          currentX += w
          rowHeight = Math.max(rowHeight, h)

          return { ...widget, layout: newLayout }
        })

        return {
          ...dashboard,
          widgets: relaid,
          updatedAt: new Date().toISOString(),
        }
      })
    },
    [mutateDashboard],
  )

  return {
    dashboards,
    isLoading,
    readOnly,
    persistenceError,
    createDashboard,
    updateDashboard,
    deleteDashboard,
    updateDashboardTimeRange,
    updateDashboardVariables,
    addWidget,
    removeWidget,
    updateWidgetDataSource,
    updateWidgetDisplay,
    updateWidgetLayouts,
    updateWidget,
    autoLayoutWidgets,
  }
}
