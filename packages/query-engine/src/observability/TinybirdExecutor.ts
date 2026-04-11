import { Effect, Schema, Context } from "effect"
import type { TinybirdPipe } from "@maple/domain/tinybird-pipes"

export class ObservabilityError extends Schema.TaggedErrorClass<ObservabilityError>()(
  "@maple/query-engine/errors/ObservabilityError",
  {
    message: Schema.String,
    pipe: Schema.optionalKey(Schema.String),
    cause: Schema.optionalKey(Schema.Defect),
  },
) {}

export interface TinybirdExecutorShape {
  /** The org ID for the current tenant — needed for raw SQL queries. */
  readonly orgId: string

  readonly query: <T = any>(
    pipe: TinybirdPipe,
    params: Record<string, unknown>,
  ) => Effect.Effect<{ data: ReadonlyArray<T> }, ObservabilityError>

  /** Execute raw ClickHouse SQL. The SQL MUST include an OrgId filter. */
  readonly sqlQuery: <T = Record<string, unknown>>(
    sql: string,
  ) => Effect.Effect<ReadonlyArray<T>, ObservabilityError>
}

export class TinybirdExecutor extends Context.Service<TinybirdExecutor, TinybirdExecutorShape>()(
  "TinybirdExecutor",
) {}
