import { useState } from "react"
import { useCustomer, usePricingTable } from "autumn-js/react"
import { toast } from "sonner"

type Product = NonNullable<
  ReturnType<typeof usePricingTable>["products"]
>[number]
type ProductItem = Product["items"][number]

import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  FileIcon,
  PulseIcon,
  ChartLineIcon,
} from "@/components/icons"
import type { IconComponent } from "@/components/icons"

const FEATURE_ICONS: Record<string, IconComponent> = {
  logs: FileIcon,
  traces: PulseIcon,
  metrics: ChartLineIcon,
}

function getProductPrice(product: Product): {
  price: string
  interval?: string
} {
  if (product.properties.is_free) return { price: "$0" }
  const baseItem = product.items.find(
    (i) => !i.feature_id && i.price != null,
  )
  if (baseItem?.price != null) {
    return {
      price: `$${baseItem.price}`,
      interval: baseItem.interval ? `/${baseItem.interval}` : undefined,
    }
  }
  return { price: product.display?.name ?? product.name }
}

function formatIncludedUsage(item: ProductItem): string {
  if (item.included_usage === "inf") return "Unlimited"
  if (item.included_usage != null) return `${item.included_usage} GB`
  return ""
}

function normalizeDetailText(text: string): string {
  return text.replace(/\bper\s+(Logs|Traces|Metrics)\b/i, "per GB")
}

function getFeatureRows(product: Product) {
  return product.items
    .filter((item) => item.feature_id)
    .map((item) => ({
      featureId: item.feature_id ?? "",
      label: item.feature?.name ?? item.feature_id ?? "",
      value: formatIncludedUsage(item),
      detail: item.display?.secondary_text
        ? normalizeDetailText(item.display.secondary_text)
        : undefined,
    }))
}

function getButtonConfig(product: Product) {
  const { scenario, properties } = product

  if (product.display?.button_text) {
    const disabled = scenario === "active" && !properties.updateable
    return {
      label: product.display.button_text,
      variant: (scenario === "active" ? "secondary" : "default") as
        | "default"
        | "secondary"
        | "outline",
      disabled,
    }
  }

  if (properties.has_trial) {
    return { label: "Start trial", variant: "default" as const, disabled: false }
  }

  switch (scenario) {
    case "active":
      return {
        label: "Current plan",
        variant: "secondary" as const,
        disabled: true,
      }
    case "scheduled":
      return {
        label: "Scheduled",
        variant: "secondary" as const,
        disabled: true,
      }
    case "upgrade":
      return {
        label: "Upgrade",
        variant: "default" as const,
        disabled: false,
      }
    case "downgrade":
      return {
        label: "Downgrade",
        variant: "outline" as const,
        disabled: false,
      }
    case "cancel":
      return {
        label: "Resubscribe",
        variant: "outline" as const,
        disabled: false,
      }
    case "new":
    case "renew":
    default:
      return {
        label: "Subscribe",
        variant: "outline" as const,
        disabled: false,
      }
  }
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount)
}

interface CheckoutPreview {
  productId: string
  productName: string
  lines: { description: string; amount: number }[]
  total: number
  currency: string
  nextCycle?: { starts_at: number; total: number }
}

export function PricingCards() {
  const { products, isLoading, error } = usePricingTable()
  const { checkout, attach, refetch } = useCustomer()
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<CheckoutPreview | null>(
    null,
  )
  const [isAttaching, setIsAttaching] = useState(false)

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-6 w-20" />
              <Skeleton className="mt-1 h-3 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </CardContent>
            <CardFooter>
              <Skeleton className="h-8 w-full" />
            </CardFooter>
          </Card>
        ))}
      </div>
    )
  }

  if (error || !products) {
    return (
      <p className="text-muted-foreground text-sm">
        Unable to load pricing plans.
      </p>
    )
  }

  async function handleCheckout(productId: string, buttonUrl?: string) {
    if (buttonUrl) {
      window.open(buttonUrl, "_blank", "noopener")
      return
    }

    setLoadingProductId(productId)
    try {
      const result = await checkout({ productId })

      if (result.error) {
        toast.error(result.error.message)
        return
      }

      if (result.data.url) {
        window.location.href = result.data.url
        return
      }

      setConfirmDialog({
        productId,
        productName: result.data.product?.name ?? productId,
        lines: result.data.lines.map((l) => ({
          description: l.description,
          amount: l.amount,
        })),
        total: result.data.total,
        currency: result.data.currency,
        nextCycle: result.data.next_cycle,
      })
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setLoadingProductId(null)
    }
  }

  async function handleConfirmAttach() {
    if (!confirmDialog) return
    setIsAttaching(true)
    try {
      const result = await attach({ productId: confirmDialog.productId })
      if (result.error) {
        toast.error(result.error.message)
        return
      }
      toast.success("Plan updated successfully.")
      await refetch()
      setConfirmDialog(null)
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setIsAttaching(false)
    }
  }

  return (
    <>
      <div
        className={cn(
          "grid grid-cols-1 gap-4",
          products.length === 2 && "sm:grid-cols-2",
          products.length >= 3 && "sm:grid-cols-3",
        )}
      >
        {products.map((product) => {
          const isActive = product.scenario === "active"
          const { price, interval } = getProductPrice(product)
          const features = getFeatureRows(product)
          const btn = getButtonConfig(product)
          const trialAvailable = product.free_trial?.trial_available

          return (
            <Card
              key={product.id}
              className={cn(isActive && "ring-primary/40")}
            >
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-xs font-medium uppercase tracking-widest">
                    {product.display?.name ?? product.name}
                  </CardTitle>
                  {isActive && (
                    <Badge variant="secondary" className="text-[10px]">
                      Current
                    </Badge>
                  )}
                  {product.display?.recommend_text && !isActive && (
                    <Badge variant="outline" className="text-[10px]">
                      {product.display.recommend_text}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex items-baseline gap-0.5">
                  <span className="text-lg font-medium">{price}</span>
                  {interval && (
                    <span className="text-muted-foreground text-xs">
                      {interval}
                    </span>
                  )}
                </div>
                {product.display?.description && (
                  <CardDescription>
                    {product.display.description}
                  </CardDescription>
                )}
                {product.display?.everything_from && (
                  <p className="text-muted-foreground text-xs">
                    Everything in {product.display.everything_from}, plus:
                  </p>
                )}
              </CardHeader>

              {features.length > 0 && (
                <CardContent>
                  <Separator className="mb-3" />
                  <div className="space-y-2">
                    {features.map((feature) => {
                      const Icon = FEATURE_ICONS[feature.featureId]
                      return (
                        <div
                          key={feature.featureId}
                          className="flex items-center justify-between"
                        >
                          <div className="text-muted-foreground flex items-center gap-2">
                            {Icon && <Icon className="size-3.5" />}
                            <span>{feature.label}</span>
                          </div>
                          <div className="text-right">
                            <span className="tabular-nums">
                              {feature.value}
                            </span>
                            {feature.detail && (
                              <p className="text-muted-foreground text-[10px]">
                                {feature.detail}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              )}

              <CardFooter className="mt-auto">
                <Button
                  variant={btn.variant}
                  disabled={btn.disabled || loadingProductId === product.id}
                  className="w-full"
                  onClick={() =>
                    handleCheckout(product.id, product.display?.button_url)
                  }
                >
                  {loadingProductId === product.id ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <>
                      {btn.label}
                      {trialAvailable && !btn.disabled && " — Start free trial"}
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>

      <Dialog
        open={confirmDialog !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm plan change</DialogTitle>
            <DialogDescription>
              You're switching to{" "}
              <span className="text-foreground font-medium">
                {confirmDialog?.productName}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          {confirmDialog && (
            <div className="space-y-2 text-xs">
              {confirmDialog.lines.map((line, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {line.description}
                  </span>
                  <span className="tabular-nums">
                    {formatCurrency(line.amount, confirmDialog.currency)}
                  </span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between font-medium">
                <span>Due today</span>
                <span className="tabular-nums">
                  {formatCurrency(confirmDialog.total, confirmDialog.currency)}
                </span>
              </div>
              {confirmDialog.nextCycle && (
                <p className="text-muted-foreground text-xs">
                  Then{" "}
                  {formatCurrency(
                    confirmDialog.nextCycle.total,
                    confirmDialog.currency,
                  )}{" "}
                  starting{" "}
                  {new Date(
                    confirmDialog.nextCycle.starts_at * 1000,
                  ).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog(null)}
              disabled={isAttaching}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmAttach} disabled={isAttaching}>
              {isAttaching ? <Spinner className="size-3.5" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
