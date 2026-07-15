import { useAtomSet } from "@/lib/effect-atom"
import { useState } from "react"
import { Exit } from "effect"
import type { ApiKeyKind } from "@maple/domain/http"
import { toast } from "sonner"

import { Button } from "@maple/ui/components/ui/button"
import { Input } from "@maple/ui/components/ui/input"
import { Label } from "@maple/ui/components/ui/label"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogPanel,
	DialogTitle,
} from "@maple/ui/components/ui/dialog"
import { useApiKeyMutationSync } from "@/hooks/use-api-keys"
import { MapleApiV2AtomClient } from "@/lib/services/common/v2-atom-client"
import { buildApiKeyCreatePayload } from "./api-key-create-payload"
import { ApiKeySecretReveal } from "./api-key-secret-reveal"

interface CreateApiKeyDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onCreated?: (secret: string) => void
	kind?: ApiKeyKind
}

export function CreateApiKeyDialog({ open, onOpenChange, onCreated, kind }: CreateApiKeyDialogProps) {
	const [newName, setNewName] = useState("")
	const [newDescription, setNewDescription] = useState("")
	const [isCreating, setIsCreating] = useState(false)
	const [newSecret, setNewSecret] = useState<string | null>(null)

	const { prepareForMutation, reconcileTxid } = useApiKeyMutationSync()
	const createMutation = useAtomSet(MapleApiV2AtomClient.mutation("apiKeys", "create"), {
		mode: "promiseExit",
	})

	async function handleCreate() {
		if (!newName.trim()) return
		setIsCreating(true)
		prepareForMutation()
		const result = await createMutation({
			payload: buildApiKeyCreatePayload(newName, newDescription, kind),
		})
		if (Exit.isSuccess(result)) {
			setNewSecret(result.value.secret)
			onCreated?.(result.value.secret)
			void reconcileTxid(result.value.txid)
		} else {
			toast.error("Failed to create API key")
		}
		setIsCreating(false)
	}

	function handleClose(nextOpen: boolean) {
		if (nextOpen) {
			onOpenChange(true)
			return
		}
		onOpenChange(false)
		setNewName("")
		setNewDescription("")
		setNewSecret(null)
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent>
				{newSecret ? (
					<>
						<DialogHeader>
							<DialogTitle>API key created</DialogTitle>
							<DialogDescription>
								Copy your API key now. You won't be able to see it again.
							</DialogDescription>
						</DialogHeader>
						<DialogPanel>
							<ApiKeySecretReveal secret={newSecret} />
						</DialogPanel>
						<DialogFooter>
							<Button variant="outline" onClick={() => handleClose(false)}>
								Close
							</Button>
						</DialogFooter>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>Create API key</DialogTitle>
							<DialogDescription>
								API keys are used to authenticate with the Maple API and MCP server.
							</DialogDescription>
						</DialogHeader>
						<DialogPanel className="space-y-3">
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
									<span className="text-muted-foreground font-normal">(optional)</span>
								</Label>
								<Input
									id="api-key-description"
									placeholder="What is this key used for?"
									value={newDescription}
									onChange={(e) => setNewDescription(e.target.value)}
								/>
							</div>
						</DialogPanel>
						<DialogFooter>
							<Button variant="outline" onClick={() => handleClose(false)}>
								Cancel
							</Button>
							<Button onClick={handleCreate} disabled={!newName.trim() || isCreating}>
								{isCreating ? "Creating..." : "Create"}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	)
}
