import type { ReactNode } from "react"
import { Card, CardContent } from "@maple/ui/components/ui/card"
import { cn } from "@maple/ui/utils"

type Tone = "default" | "critical" | "emerald" | "amber"

const valueToneClass: Record<Tone, string> = {
  default:  "text-foreground",
  critical: "text-destructive",
  emerald:  "text-emerald-500",
  amber:    "text-amber-500",
}

export function AlertStatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
  indicator,
  className,
  children,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
  icon?: ReactNode
  indicator?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            {label}
          </span>
          {indicator ?? (icon ? <span className="text-muted-foreground">{icon}</span> : null)}
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className={cn("text-3xl font-bold tabular-nums", valueToneClass[tone])}>
            {value}
          </span>
          {hint && <span className="text-muted-foreground text-sm">{hint}</span>}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}
