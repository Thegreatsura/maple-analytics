import { useState } from "react"
import { toast } from "sonner"

import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@maple/ui/components/ui/input-group"
import { CheckIcon, CopyIcon } from "@/components/icons"

interface ApiKeySecretRevealProps {
	secret: string
}

/**
 * Read-only reveal of a freshly minted API key secret, shown once at create/roll
 * time. Shared by the create and roll dialogs so the "copy it now, you won't see
 * it again" UX stays identical.
 */
export function ApiKeySecretReveal({ secret }: ApiKeySecretRevealProps) {
	const [copied, setCopied] = useState(false)

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(secret)
			setCopied(true)
			toast.success("API key copied to clipboard")
			setTimeout(() => setCopied(false), 2000)
		} catch {
			toast.error("Failed to copy API key")
		}
	}

	return (
		<div className="space-y-3">
			<InputGroup>
				<InputGroupInput
					readOnly
					value={secret}
					className="font-mono text-xs tracking-wide select-all"
				/>
				<InputGroupAddon align="inline-end">
					<InputGroupButton
						onClick={handleCopy}
						aria-label="Copy API key"
						title={copied ? "Copied!" : "Copy"}
					>
						{copied ? (
							<CheckIcon size={14} className="text-severity-info" />
						) : (
							<CopyIcon size={14} />
						)}
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
			<p className="text-muted-foreground text-xs">
				Store this key in a secure location. It will not be shown again.
			</p>
		</div>
	)
}
