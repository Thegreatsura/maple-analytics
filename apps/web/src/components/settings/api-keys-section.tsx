import { useCallback, useEffect, useState } from "react"
import { createMapleApiClient } from "@maple/api-client"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertWarningIcon,
  CheckIcon,
  CopyIcon,
  KeyIcon,
  PlusIcon,
} from "@/components/icons"
import { apiBaseUrl } from "@/lib/services/common/api-base-url"
import { getMapleAuthHeaders } from "@/lib/services/common/auth-headers"

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

interface ApiKey {
  id: string
  name: string
  description: string | null
  keyPrefix: string
  revoked: boolean
  createdAt: number
  lastUsedAt: number | null
}

function formatDate(timestamp: number | null): string {
  if (!timestamp) return "Never"
  try {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  } catch {
    return "Unknown"
  }
}

export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [secretCopied, setSecretCopied] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)

  const fetchKeys = useCallback(async () => {
    try {
      const result = await mapleApiClient.listApiKeys()
      setKeys(
        result.keys.map((k) => ({
          id: k.id,
          name: k.name,
          description: k.description,
          keyPrefix: k.keyPrefix,
          revoked: k.revoked,
          createdAt: k.createdAt,
          lastUsedAt: k.lastUsedAt,
        })),
      )
    } catch {
      toast.error("Failed to load API keys")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchKeys()
  }, [fetchKeys])

  async function handleCreate() {
    if (!newName.trim()) return
    setIsCreating(true)
    try {
      const result = await mapleApiClient.createApiKey({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      })
      setNewSecret(result.secret)
      await fetchKeys()
    } catch {
      toast.error("Failed to create API key")
    } finally {
      setIsCreating(false)
    }
  }

  function handleCreateDialogClose(open: boolean) {
    if (open) {
      setCreateOpen(true)
      return
    }
    setCreateOpen(false)
    setNewName("")
    setNewDescription("")
    setNewSecret(null)
    setSecretCopied(false)
  }

  async function handleCopySecret() {
    if (!newSecret) return
    try {
      await navigator.clipboard.writeText(newSecret)
      setSecretCopied(true)
      toast.success("API key copied to clipboard")
      setTimeout(() => setSecretCopied(false), 2000)
    } catch {
      toast.error("Failed to copy API key")
    }
  }

  function openRevokeDialog(keyId: string) {
    setRevokingKeyId(keyId)
    setRevokeOpen(true)
  }

  async function handleRevoke() {
    if (!revokingKeyId) return
    setIsRevoking(true)
    try {
      await mapleApiClient.revokeApiKey({ keyId: revokingKeyId })
      toast.success("API key revoked")
      await fetchKeys()
    } catch {
      toast.error("Failed to revoke API key")
    } finally {
      setIsRevoking(false)
      setRevokeOpen(false)
      setRevokingKeyId(null)
    }
  }

  const activeKeys = keys.filter((k) => !k.revoked)
  const revokedKeys = keys.filter((k) => k.revoked)

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle>API Keys</CardTitle>
              <CardDescription>
                Create and manage API keys for programmatic access to Maple. Keys
                are scoped to your current organization.
              </CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <PlusIcon data-icon="inline-start" size={14} />
              Create key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : keys.length === 0 ? (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <KeyIcon size={16} />
                </EmptyMedia>
                <EmptyTitle>No API keys</EmptyTitle>
                <EmptyDescription>
                  Create an API key to authenticate with the Maple API and MCP
                  server.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-4">
              {activeKeys.length > 0 && (
                <div className="space-y-2">
                  {activeKeys.map((key) => (
                    <ApiKeyListItem
                      key={key.id}
                      apiKey={key}
                      onRevoke={() => openRevokeDialog(key.id)}
                    />
                  ))}
                </div>
              )}
              {revokedKeys.length > 0 && (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs font-medium">
                    Revoked
                  </p>
                  {revokedKeys.map((key) => (
                    <ApiKeyListItem key={key.id} apiKey={key} />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={handleCreateDialogClose}>
        <DialogContent>
          {newSecret ? (
            <>
              <DialogHeader>
                <DialogTitle>API key created</DialogTitle>
                <DialogDescription>
                  Copy your API key now. You won't be able to see it again.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <InputGroup>
                  <InputGroupInput
                    readOnly
                    value={newSecret}
                    className="font-mono text-xs tracking-wide select-all"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      onClick={handleCopySecret}
                      aria-label="Copy API key"
                      title={secretCopied ? "Copied!" : "Copy"}
                    >
                      {secretCopied ? (
                        <CheckIcon size={14} className="text-emerald-500" />
                      ) : (
                        <CopyIcon size={14} />
                      )}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <p className="text-muted-foreground text-xs">
                  Store this key in a secure location. It will not be shown
                  again.
                </p>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => handleCreateDialogClose(false)}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create API key</DialogTitle>
                <DialogDescription>
                  API keys are used to authenticate with the Maple API and MCP
                  server.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="api-key-name">Name</Label>
                  <Input
                    id="api-key-name"
                    placeholder="e.g. CI/CD Pipeline"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newName.trim()) {
                        void handleCreate()
                      }
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="api-key-description">
                    Description{" "}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="api-key-description"
                    placeholder="What is this key used for?"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => handleCreateDialogClose(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newName.trim() || isCreating}
                >
                  {isCreating ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10">
              <AlertWarningIcon className="text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Any integrations using this key will
              stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRevoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleRevoke}
              disabled={isRevoking}
            >
              {isRevoking ? "Revoking..." : "Revoke key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ApiKeyListItem({
  apiKey,
  onRevoke,
}: {
  apiKey: ApiKey
  onRevoke?: () => void
}) {
  return (
    <div className="bg-muted/30 flex items-center justify-between border px-3 py-2">
      <div className="flex items-center gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">{apiKey.name}</span>
            <Badge variant={apiKey.revoked ? "destructive" : "secondary"}>
              {apiKey.revoked ? "Revoked" : "Active"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            <span className="font-mono">{apiKey.keyPrefix}</span>
            {" · "}Created {formatDate(apiKey.createdAt)}
            {apiKey.lastUsedAt && <> · Last used {formatDate(apiKey.lastUsedAt)}</>}
          </p>
        </div>
      </div>
      {!apiKey.revoked && onRevoke && (
        <Button variant="ghost" size="xs" onClick={onRevoke}>
          Revoke
        </Button>
      )}
    </div>
  )
}
