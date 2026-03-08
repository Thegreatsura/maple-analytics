import type { Effect } from "effect"
import * as Schema from "effect/Schema"

export class McpTenantError extends Schema.TaggedError<McpTenantError>()(
  "McpTenantError",
  { message: Schema.String },
) {}

export class McpQueryError extends Schema.TaggedError<McpQueryError>()(
  "McpQueryError",
  { message: Schema.String, pipe: Schema.String },
) {}

export type McpToolError = McpTenantError | McpQueryError

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}

export interface McpToolRegistrar {
  tool<TSchema extends Schema.Schema.AnyNoContext>(
    name: string,
    description: string,
    schema: TSchema,
    handler: (params: Schema.Schema.Type<TSchema>) => Effect.Effect<McpToolResult, McpToolError, any>,
  ): void
}

export const requiredStringParam = (description: string) =>
  Schema.String.annotations({ description })

export const optionalStringParam = (description: string) =>
  Schema.optional(Schema.String).annotations({ description })

export const optionalNumberParam = (description: string) =>
  Schema.optional(Schema.Number).annotations({ description })

export const optionalBooleanParam = (description: string) =>
  Schema.optional(Schema.Boolean).annotations({ description })
