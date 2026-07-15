import type { ApiKeyKind } from "@maple/domain/http"
import type { V2ApiKeyCreateParams } from "@maple/domain/http/v2"

export const buildApiKeyCreatePayload = (
	name: string,
	description: string,
	kind: ApiKeyKind | undefined,
): V2ApiKeyCreateParams => {
	const trimmedDescription = description.trim()

	return {
		name: name.trim(),
		...(trimmedDescription.length > 0 ? { description: trimmedDescription } : {}),
		...(kind !== undefined ? { kind } : {}),
	}
}
