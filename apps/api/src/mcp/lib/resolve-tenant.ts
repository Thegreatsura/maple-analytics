import { ManagedRuntime, Effect, Layer } from "effect"
import type { TenantContext as McpTenantContext } from "@/lib/tenant-context"
import { AuthService } from "@/services/AuthService"
import { ApiKeysService } from "@/services/ApiKeysService"
import { Env } from "@/services/Env"
import { API_KEY_PREFIX } from "@maple/db"

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

  if (token && token.startsWith(API_KEY_PREFIX)) {
    const resolved = await ApiKeyResolutionRuntime.runPromise(
      ApiKeysService.resolveByKey(token),
    )

    if (resolved) {
      // Touch lastUsedAt in the background — fire and forget
      void ApiKeyResolutionRuntime.runPromise(
        ApiKeysService.touchLastUsed(resolved.keyId).pipe(Effect.ignore),
      )

      return {
        orgId: resolved.orgId,
        userId: resolved.userId,
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
