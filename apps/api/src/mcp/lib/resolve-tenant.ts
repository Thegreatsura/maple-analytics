import { timingSafeEqual } from "node:crypto"
import { Effect, Option, Redacted, Schema } from "effect"
import type { TenantContext as McpTenantContext } from "@/lib/tenant-context"
import { AuthService } from "@/services/AuthService"
import { ApiKeysService } from "@/services/ApiKeysService"
import { Env } from "@/services/Env"
import { OrgId, UserId } from "@maple/domain/http"
import { API_KEY_PREFIX } from "@maple/db"
import { McpTenantError } from "../tools/types"

const INTERNAL_SERVICE_PREFIX = "maple_svc_"
const decodeOrgIdSync = Schema.decodeUnknownSync(OrgId)
const decodeUserIdSync = Schema.decodeUnknownSync(UserId)

const toHeaderRecord = (headers: Headers): Record<string, string> => {
  const record: Record<string, string> = {}

  for (const [name, value] of headers.entries()) {
    record[name] = value
  }

  return record
}

const getBearerToken = (headers: Headers): string | undefined => {
  const header = headers.get("authorization")
  if (!header) return undefined
  const [scheme, token] = header.split(" ")
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return undefined
  return token
}

export const resolveMcpTenantContext = (
  request: Request,
): Effect.Effect<McpTenantContext, McpTenantError, Env | ApiKeysService | AuthService> =>
  Effect.gen(function* () {
  const token = getBearerToken(request.headers)

  // Internal service auth (e.g. chat agent)
  if (token && token.startsWith(INTERNAL_SERVICE_PREFIX)) {
    const provided = token.slice(INTERNAL_SERVICE_PREFIX.length)
    const env = yield* Env
    const expected = Option.match(env.INTERNAL_SERVICE_TOKEN, {
      onNone: () => undefined,
      onSome: (value) => Redacted.value(value),
    })

    if (!expected) {
      return yield* Effect.fail(
        new McpTenantError({
          message: "INTERNAL_SERVICE_TOKEN is not configured on the server",
        }),
      )
    }

    if (
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    ) {
      const orgId = Option.match(env.MAPLE_ORG_ID_OVERRIDE, {
        onNone: () => request.headers.get("x-org-id"),
        onSome: (value) => value,
      })
      if (!orgId) {
        return yield* Effect.fail(
          new McpTenantError({
            message: "X-Org-Id header is required for internal service auth",
          }),
        )
      }

      try {
        return {
          orgId: decodeOrgIdSync(orgId),
          userId: decodeUserIdSync("internal-service"),
          roles: [],
          authMode: "self_hosted",
        }
      } catch (error) {
        return yield* Effect.fail(
          new McpTenantError({
            message: error instanceof Error ? error.message : String(error),
          }),
        )
      }
    }

    return yield* Effect.fail(
      new McpTenantError({
        message: `Internal service token mismatch (provided length: ${provided.length}, expected length: ${expected.length})`,
      }),
    )
  }

  if (token && token.startsWith(API_KEY_PREFIX)) {
    const apiKeys = yield* ApiKeysService
    const resolved = yield* apiKeys.resolveByKey(token).pipe(
      Effect.mapError(
        (error) =>
          new McpTenantError({
            message: error.message,
          }),
      ),
    )

    if (Option.isSome(resolved)) {
      // Touch lastUsedAt in the background — fire and forget
      yield* apiKeys.touchLastUsed(resolved.value.keyId).pipe(
        Effect.ignore,
        Effect.forkDetach,
      )

      return {
        orgId: resolved.value.orgId,
        userId: resolved.value.userId,
        roles: [],
        authMode: "self_hosted",
      }
    }
  }

  // Fall back to existing Clerk / self-hosted session auth
  const auth = yield* AuthService
  const tenant = yield* auth.resolveMcpTenant(toHeaderRecord(request.headers)).pipe(
    Effect.mapError(
      (error) =>
        new McpTenantError({
          message: error.message,
        }),
    ),
  )

  return {
    orgId: tenant.orgId,
    userId: tenant.userId,
    roles: [...tenant.roles],
    authMode: tenant.authMode,
  }
})
