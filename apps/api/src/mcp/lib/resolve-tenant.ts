import { timingSafeEqual } from "node:crypto"
import { ManagedRuntime, Effect, Layer, Option, Redacted, Schema } from "effect"
import type { TenantContext as McpTenantContext } from "@/lib/tenant-context"
import { AuthService } from "@/services/AuthService"
import { ApiKeysService } from "@/services/ApiKeysService"
import { Env } from "@/services/Env"
import { OrgId, UserId } from "@maple/domain/http"
import { API_KEY_PREFIX } from "@maple/db"

const INTERNAL_SERVICE_PREFIX = "maple_svc_"
const decodeOrgIdSync = Schema.decodeUnknownSync(OrgId)
const decodeUserIdSync = Schema.decodeUnknownSync(UserId)

const EnvRuntime = ManagedRuntime.make(Env.Default)
const ApiKeyResolutionRuntime = ManagedRuntime.make(
  ApiKeysService.Live.pipe(Layer.provide(Env.Default)),
)
const AuthRuntime = ManagedRuntime.make(AuthService.Default)

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

export async function resolveMcpTenantContext(request: Request): Promise<McpTenantContext> {
  const token = getBearerToken(request.headers)

  // Internal service auth (e.g. chat agent)
  if (token && token.startsWith(INTERNAL_SERVICE_PREFIX)) {
    const provided = token.slice(INTERNAL_SERVICE_PREFIX.length)
    const env = await EnvRuntime.runPromise(Env)
    const expected = Option.match(env.INTERNAL_SERVICE_TOKEN, {
      onNone: () => undefined,
      onSome: Redacted.value,
    })

    if (!expected) {
      throw new Error("INTERNAL_SERVICE_TOKEN is not configured on the server")
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
        throw new Error("X-Org-Id header is required for internal service auth")
      }

      return {
        orgId: decodeOrgIdSync(orgId),
        userId: decodeUserIdSync("internal-service"),
        roles: [],
        authMode: "self_hosted",
      }
    }

    throw new Error(
      `Internal service token mismatch (provided length: ${provided.length}, expected length: ${expected.length})`,
    )
  }

  if (token && token.startsWith(API_KEY_PREFIX)) {
    const resolved = await ApiKeyResolutionRuntime.runPromise(
      ApiKeysService.resolveByKey(token),
    )

    if (Option.isSome(resolved)) {
      // Touch lastUsedAt in the background — fire and forget
      void ApiKeyResolutionRuntime.runPromise(
        ApiKeysService.touchLastUsed(resolved.value.keyId).pipe(Effect.ignore),
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
  const tenant = await AuthRuntime.runPromise(
    AuthService.resolveMcpTenant(toHeaderRecord(request.headers)),
  )

  return {
    orgId: tenant.orgId,
    userId: tenant.userId,
    roles: [...tenant.roles],
    authMode: tenant.authMode,
  }
}
