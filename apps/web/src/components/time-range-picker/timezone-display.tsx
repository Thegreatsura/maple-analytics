import { getTimezoneAbbr, getTimezoneDisplay } from "@/lib/time-utils"

export function TimezoneDisplay() {
	const offset = getTimezoneDisplay()
	const abbr = getTimezoneAbbr()

	return (
		<div className="flex items-center justify-between gap-3 border-t border-border/70 bg-muted/20 px-4 py-2.5">
			<span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
				Timezone
			</span>
			<span className="font-mono text-[11px] tracking-tight text-foreground/85">
				{offset}
				<span className="text-muted-foreground/70"> · {abbr}</span>
			</span>
		</div>
	)
}
