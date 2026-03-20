import { HttpServerRequest } from "effect/unstable/http"
import type { TinybirdPipe } from "@maple/domain"
import { Effect, ManagedRuntime } from "effect"
import { resolveMcpTenantContext } from "@/mcp/lib/resolve-tenant"
import { McpTenantError, McpQueryError } from "@/mcp/tools/types"
import { TinybirdService } from "@/services/TinybirdService"
import type { TenantContext } from "@/services/AuthService"

const TinybirdRuntime = ManagedRuntime.make(TinybirdService.layer)

const resolveTenant: Effect.Effect<TenantContext, McpTenantError, HttpServerRequest.HttpServerRequest> = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const nativeReq = yield* HttpServerRequest.toWeb(req)
  return yield* Effect.tryPromise({
    try: () => resolveMcpTenantContext(nativeReq),
    catch: (error) =>
      new McpTenantError({
        message: error instanceof Error ? error.message : String(error),
      }),
  })
}).pipe(
  Effect.catchTag("RequestParseError", (error) =>
    Effect.fail(new McpTenantError({ message: error.message })),
  ),
)

export const queryTinybird = <T = any>(
  pipe: TinybirdPipe,
  params?: Record<string, unknown>,
): Effect.Effect<{ data: T[] }, McpTenantError | McpQueryError, HttpServerRequest.HttpServerRequest> =>
  Effect.gen(function* () {
    const tenant = yield* resolveTenant

    const response = yield* Effect.tryPromise({
      try: () =>
        TinybirdRuntime.runPromise(
          TinybirdService.use((service) => service.query(tenant, { pipe, params })),
        ),
      catch: (error) =>
        new McpQueryError({
          message: error instanceof Error ? error.message : String(error),
          pipe,
        }),
    })

    return { data: response.data as T[] }
  })
