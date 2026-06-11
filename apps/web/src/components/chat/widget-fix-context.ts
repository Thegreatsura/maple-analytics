import { fromBase64Url, toBase64Url } from "@/lib/base64url"

export interface WidgetFixContext {
	dashboardId: string
	widgetId: string
	widgetTitle: string
	widgetJson: string
	errorTitle: string | null
	errorMessage: string | null
}

export const encodeWidgetFixContextToSearchParam = (ctx: WidgetFixContext): string =>
	toBase64Url(JSON.stringify(ctx))

const isWidgetFixContext = (value: unknown): value is WidgetFixContext => {
	if (!value || typeof value !== "object") return false
	const v = value as Record<string, unknown>
	if (typeof v.dashboardId !== "string") return false
	if (typeof v.widgetId !== "string") return false
	if (typeof v.widgetTitle !== "string") return false
	if (typeof v.widgetJson !== "string") return false
	if (v.errorTitle !== null && typeof v.errorTitle !== "string") return false
	if (v.errorMessage !== null && typeof v.errorMessage !== "string") return false
	return true
}

export const decodeWidgetFixContextFromSearchParam = (raw: string): WidgetFixContext | undefined => {
	try {
		const json = fromBase64Url(raw)
		const parsed = JSON.parse(json) as unknown
		if (!isWidgetFixContext(parsed)) return undefined
		return parsed
	} catch {
		return undefined
	}
}

export const widgetFixTabId = (ctx: Pick<WidgetFixContext, "dashboardId" | "widgetId">): string =>
	`widget-fix-${ctx.dashboardId}-${ctx.widgetId}`

export const widgetFixTabTitle = (ctx: Pick<WidgetFixContext, "widgetTitle">): string => {
	const base = ctx.widgetTitle.trim().length === 0 ? "widget" : ctx.widgetTitle
	const truncated = base.length > 24 ? `${base.slice(0, 24)}…` : base
	return `Fix: ${truncated}`
}

export const widgetFixSuggestions = (_ctx: WidgetFixContext): string[] => [
	"Try a different fix",
	"Explain what's wrong",
	"Show me what changed",
]

export const widgetFixAutoPrompt = "Fix this widget"
