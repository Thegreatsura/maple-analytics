import { ChatBubbleSparkleIcon, XmarkIcon } from "@/components/icons"
import { DashboardAiConversation } from "./dashboard-ai-conversation"
import type {
  DashboardWidget,
  VisualizationType,
  WidgetDataSource,
  WidgetDisplayConfig,
} from "@/components/dashboard-builder/types"

interface DashboardAiPanelProps {
  onOpenChange: (open: boolean) => void
  dashboardId: string
  dashboardName: string
  widgets: DashboardWidget[]
  onAddWidget: (
    visualization: VisualizationType,
    dataSource: WidgetDataSource,
    display: WidgetDisplayConfig,
  ) => void
  onRemoveWidget: (widgetId: string) => void
}

export function DashboardAiPanel({
  onOpenChange,
  dashboardId,
  dashboardName,
  widgets,
  onAddWidget,
  onRemoveWidget,
}: DashboardAiPanelProps) {
  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l bg-background">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <ChatBubbleSparkleIcon className="size-4" />
        <h2 className="text-sm font-medium">Dashboard AI</h2>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="ml-auto rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
        >
          <XmarkIcon className="size-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <DashboardAiConversation
          dashboardId={dashboardId}
          dashboardName={dashboardName}
          widgets={widgets}
          onAddWidget={onAddWidget}
          onRemoveWidget={onRemoveWidget}
        />
      </div>
    </div>
  )
}
