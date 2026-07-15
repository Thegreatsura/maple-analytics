import { V2ApiKeyCreateParams } from "@maple/domain/http/v2"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { buildApiKeyCreatePayload } from "./api-key-create-payload"

describe("buildApiKeyCreatePayload", () => {
	it("omits absent optional JSON fields", () => {
		const payload = buildApiKeyCreatePayload("  CI key  ", "   ", undefined)

		expect(payload).toEqual({ name: "CI key" })
		expect(() => Schema.encodeUnknownSync(V2ApiKeyCreateParams)(payload)).not.toThrow()
	})

	it("preserves the MCP kind and a non-empty description", () => {
		const payload = buildApiKeyCreatePayload("  MCP key  ", "  Claude desktop  ", "mcp")

		expect(payload).toEqual({
			name: "MCP key",
			description: "Claude desktop",
			kind: "mcp",
		})
		expect(() => Schema.encodeUnknownSync(V2ApiKeyCreateParams)(payload)).not.toThrow()
	})
})
