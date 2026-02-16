import { createMapleApiClient } from "@maple/api-client"
import { useEffect, useMemo, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { z } from "zod"

import { DashboardLayout } from "@/components/layout/dashboard-layout"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  AlertWarningIcon,
  CheckIcon,
  CopyIcon,
  EyeIcon,
  ShieldIcon,
} from "@/components/icons"
import { apiBaseUrl } from "@/lib/services/common/api-base-url"
import { getMapleAuthHeaders } from "@/lib/services/common/auth-headers"
import { ingestUrl } from "@/lib/services/common/ingest-url"
import { isClerkAuthEnabled } from "@/lib/services/common/auth-mode"
import { BillingSection } from "@/components/settings/billing-section"
import { ScrapeTargetsSection } from "@/components/settings/scrape-targets-section"

const settingsSearchSchema = z.object({
  tab: z.enum(["general", "connectors", "billing"]).optional().default("general"),
})

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  validateSearch: (search) => settingsSearchSchema.parse(search),
})

const mapleApiClient = createMapleApiClient({
  baseUrl: apiBaseUrl,
  fetch: async (input, init) => {
    const headers = new Headers(init?.headers)
    const authHeaders = await getMapleAuthHeaders()

    for (const [name, value] of Object.entries(authHeaders)) {
      headers.set(name, value)
    }

    return globalThis.fetch(input, {
      ...init,
      headers,
    })
  },
})

function maskKey(key: string): string {
  if (key.length <= 18) return key
  const prefix = key.slice(0, 14)
  const suffix = key.slice(-4)
  return `${prefix}${"•".repeat(key.length - 18)}${suffix}`
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return "Unable to complete request"
}

interface SettingsKeys {
  readonly publicKey: string
  readonly privateKey: string
}

interface ApiKeyRowProps {
  type: "public" | "private"
  label: string
  description: string
  keyValue: string
  isVisible: boolean
  onToggleVisibility: () => void
  isCopied: boolean
  onCopy: () => void
  onRegenerate: () => void
  disabled: boolean
}

function ApiKeyRow({
  type,
  label,
  description,
  keyValue,
  isVisible,
  onToggleVisibility,
  isCopied,
  onCopy,
  onRegenerate,
  disabled,
}: ApiKeyRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant={type === "private" ? "outline" : "secondary"}>
          {type === "private" && <ShieldIcon size={12} />}
          {label}
        </Badge>
        <span className="text-muted-foreground text-xs">{description}</span>
      </div>

      <InputGroup>
        <InputGroupInput
          readOnly
          value={isVisible ? keyValue : maskKey(keyValue)}
          className="font-mono text-xs tracking-wide select-all"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            onClick={onToggleVisibility}
            aria-label={isVisible ? "Hide key" : "Reveal key"}
            title={isVisible ? "Hide" : "Reveal"}
            disabled={disabled}
          >
            <EyeIcon
              size={14}
              className={isVisible ? "text-foreground" : undefined}
            />
          </InputGroupButton>

          <InputGroupButton
            onClick={onCopy}
            aria-label="Copy key to clipboard"
            title={isCopied ? "Copied!" : "Copy"}
            disabled={disabled}
          >
            {isCopied ? (
              <CheckIcon size={14} className="text-emerald-500" />
            ) : (
              <CopyIcon size={14} />
            )}
          </InputGroupButton>

          <InputGroupButton
            onClick={onRegenerate}
            aria-label="Regenerate key"
            title="Regenerate"
            className="text-destructive hover:text-destructive"
            disabled={disabled}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width={14}
              height={14}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

function GeneralSettings({
  publicKey,
  privateKey,
  publicKeyVisible,
  setPublicKeyVisible,
  privateKeyVisible,
  setPrivateKeyVisible,
  copiedKey,
  handleCopy,
  openRegenerateDialog,
  isBusy,
  endpointCopied,
  handleCopyEndpoint,
}: {
  publicKey: string
  privateKey: string
  publicKeyVisible: boolean
  setPublicKeyVisible: React.Dispatch<React.SetStateAction<boolean>>
  privateKeyVisible: boolean
  setPrivateKeyVisible: React.Dispatch<React.SetStateAction<boolean>>
  copiedKey: "public" | "private" | null
  handleCopy: (keyType: "public" | "private") => void
  openRegenerateDialog: (keyType: "public" | "private") => void
  isBusy: boolean
  endpointCopied: boolean
  handleCopyEndpoint: () => void
}) {
  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ingest Endpoint</CardTitle>
          <CardDescription>
            Send your OpenTelemetry data to this endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <InputGroup>
            <InputGroupInput
              readOnly
              value={ingestUrl}
              className="font-mono text-xs tracking-wide select-all"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                onClick={handleCopyEndpoint}
                aria-label="Copy endpoint to clipboard"
                title={endpointCopied ? "Copied!" : "Copy"}
              >
                {endpointCopied ? (
                  <CheckIcon size={14} className="text-emerald-500" />
                ) : (
                  <CopyIcon size={14} />
                )}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <p className="text-muted-foreground text-xs">
            Learn how to send telemetry data in the{" "}
            <a
              href="https://docs.maple.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2 hover:no-underline"
            >
              documentation
            </a>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>
            Use these keys to authenticate telemetry ingestion. The public key
            is safe for client-side use. Keep your private key secret and never
            expose it in frontend code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ApiKeyRow
            type="public"
            label="Public"
            description="For browser and client-side telemetry SDKs"
            keyValue={publicKey}
            isVisible={publicKeyVisible}
            onToggleVisibility={() => setPublicKeyVisible((v) => !v)}
            isCopied={copiedKey === "public"}
            onCopy={() => handleCopy("public")}
            onRegenerate={() => openRegenerateDialog("public")}
            disabled={isBusy}
          />
          <Separator />
          <ApiKeyRow
            type="private"
            label="Private"
            description="For server-side ingestion and backend services"
            keyValue={privateKey}
            isVisible={privateKeyVisible}
            onToggleVisibility={() => setPrivateKeyVisible((v) => !v)}
            isCopied={copiedKey === "private"}
            onCopy={() => handleCopy("private")}
            onRegenerate={() => openRegenerateDialog("private")}
            disabled={isBusy}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function SettingsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [keys, setKeys] = useState<SettingsKeys | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [publicKeyVisible, setPublicKeyVisible] = useState(false)
  const [privateKeyVisible, setPrivateKeyVisible] = useState(false)
  const [copiedKey, setCopiedKey] = useState<"public" | "private" | null>(null)
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false)
  const [regenerateKeyType, setRegenerateKeyType] = useState<
    "public" | "private" | null
  >(null)
  const [submittingKeyType, setSubmittingKeyType] = useState<
    "public" | "private" | null
  >(null)
  const [endpointCopied, setEndpointCopied] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadIngestKeys = async () => {
      setIsLoading(true)

      try {
        const response = await mapleApiClient.getIngestKeys()
        if (cancelled) return

        setKeys({
          publicKey: response.publicKey,
          privateKey: response.privateKey,
        })
      } catch (error) {
        if (cancelled) return
        toast.error(getErrorMessage(error))
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadIngestKeys()

    return () => {
      cancelled = true
    }
  }, [])

  const isBusy = useMemo(
    () => isLoading || submittingKeyType !== null || keys === null,
    [isLoading, keys, submittingKeyType],
  )

  async function handleCopy(keyType: "public" | "private") {
    if (!keys) return

    const key = keyType === "public" ? keys.publicKey : keys.privateKey

    try {
      await navigator.clipboard.writeText(key)
      setCopiedKey(keyType)
      toast.success("Ingest key copied to clipboard")
      setTimeout(() => {
        setCopiedKey((current) => (current === keyType ? null : current))
      }, 2000)
    } catch {
      toast.error("Failed to copy ingest key")
    }
  }

  async function handleCopyEndpoint() {
    try {
      await navigator.clipboard.writeText(ingestUrl)
      setEndpointCopied(true)
      toast.success("Ingest endpoint copied to clipboard")
      setTimeout(() => setEndpointCopied(false), 2000)
    } catch {
      toast.error("Failed to copy endpoint")
    }
  }

  function openRegenerateDialog(keyType: "public" | "private") {
    setRegenerateKeyType(keyType)
    setRegenerateDialogOpen(true)
  }

  async function handleRegenerate() {
    if (!regenerateKeyType) return

    setSubmittingKeyType(regenerateKeyType)

    try {
      const response =
        regenerateKeyType === "public"
          ? await mapleApiClient.rerollPublicIngestKey()
          : await mapleApiClient.rerollPrivateIngestKey()

      setKeys({
        publicKey: response.publicKey,
        privateKey: response.privateKey,
      })
      setCopiedKey(null)

      toast.success(
        `${regenerateKeyType === "public" ? "Public" : "Private"} key regenerated. Previous key was revoked immediately.`,
      )
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setSubmittingKeyType(null)
      setRegenerateDialogOpen(false)
      setRegenerateKeyType(null)
    }
  }

  const publicKey = keys?.publicKey ?? "Loading..."
  const privateKey = keys?.privateKey ?? "Loading..."

  const generalSettingsProps = {
    publicKey,
    privateKey,
    publicKeyVisible,
    setPublicKeyVisible,
    privateKeyVisible,
    setPrivateKeyVisible,
    copiedKey,
    handleCopy,
    openRegenerateDialog,
    isBusy,
    endpointCopied,
    handleCopyEndpoint,
  }

  return (
    <DashboardLayout
      breadcrumbs={[{ label: "Settings" }]}
      title="Settings"
      description="Manage your workspace settings and API keys."
    >
      {isClerkAuthEnabled ? (
        <Tabs
          value={search.tab}
          onValueChange={(tab) =>
            navigate({ search: { tab: tab as "general" | "connectors" | "billing" } })
          }
        >
          <TabsList variant="line">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="connectors">Connectors</TabsTrigger>
            <TabsTrigger value="billing">Usage & Billing</TabsTrigger>
          </TabsList>
          <TabsContent value="general" className="pt-4">
            <GeneralSettings {...generalSettingsProps} />
          </TabsContent>
          <TabsContent value="connectors" className="pt-4">
            <div className="max-w-2xl space-y-6">
              <p className="text-muted-foreground text-sm">
                Connect external data sources to ingest metrics alongside your
                OpenTelemetry data.
              </p>
              <ScrapeTargetsSection />
            </div>
          </TabsContent>
          <TabsContent value="billing" className="pt-4">
            <BillingSection />
          </TabsContent>
        </Tabs>
      ) : (
        <Tabs
          value={search.tab}
          onValueChange={(tab) =>
            navigate({ search: { tab: tab as "general" | "connectors" } })
          }
        >
          <TabsList variant="line">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="connectors">Connectors</TabsTrigger>
          </TabsList>
          <TabsContent value="general" className="pt-4">
            <GeneralSettings {...generalSettingsProps} />
          </TabsContent>
          <TabsContent value="connectors" className="pt-4">
            <div className="max-w-2xl space-y-6">
              <p className="text-muted-foreground text-sm">
                Connect external data sources to ingest metrics alongside your
                OpenTelemetry data.
              </p>
              <ScrapeTargetsSection />
            </div>
          </TabsContent>
        </Tabs>
      )}

      <AlertDialog
        open={regenerateDialogOpen}
        onOpenChange={setRegenerateDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10">
              <AlertWarningIcon className="text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Regenerate {regenerateKeyType === "public" ? "public" : "private"}{" "}
              key?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All existing integrations using this
              key will stop working immediately. You will need to update your{" "}
              {regenerateKeyType === "public"
                ? "client-side SDKs"
                : "server configurations"}{" "}
              with the new key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submittingKeyType !== null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleRegenerate}
              disabled={submittingKeyType !== null}
            >
              Regenerate key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  )
}
