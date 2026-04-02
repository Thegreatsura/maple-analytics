import { Schema } from "effect"
import type { StandardSchemaV1 } from "@standard-schema/spec"

/**
 * Checks if a value is an Effect Schema using the official `Schema.isSchema` guard.
 */
export const isEffectSchema: (value: unknown) => value is Schema.Top = Schema.isSchema

/**
 * If the given validator is an Effect Schema, wraps it with
 * `Schema.toStandardSchemaV1()` for TanStack Router compatibility.
 * If it's already a StandardSchema or other validator type, returns it as-is.
 *
 * @example
 * ```ts
 * const schema = Schema.Struct({
 *   tab: Schema.optional(Schema.String),
 * })
 *
 * // Automatically detects and wraps:
 * createFileRoute("/foo")({
 *   validateSearch: wrapEffectSchema(schema),
 * })
 * ```
 */
export function wrapEffectSchema<S extends Schema.Decoder<unknown>>(validator: S): StandardSchemaV1<S["Encoded"], S["Type"]> & S
export function wrapEffectSchema<T>(validator: T): T
export function wrapEffectSchema(validator: unknown): unknown {
  if (isEffectSchema(validator)) {
    return Schema.toStandardSchemaV1(validator as Schema.Decoder<unknown>)
  }
  return validator
}
