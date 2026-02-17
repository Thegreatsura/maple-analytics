import { HttpApiBuilder } from "@effect/platform"
import { CurrentTenant, MapleApi } from "@maple/domain/http"
import { Effect } from "effect"
import { ApiKeysService } from "../services/ApiKeysService"

export const HttpApiKeysLive = HttpApiBuilder.group(
  MapleApi,
  "apiKeys",
  (handlers) =>
    Effect.gen(function* () {
      const apiKeysService = yield* ApiKeysService

      return handlers
        .handle("list", () =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            return yield* apiKeysService.list(tenant.orgId)
          }),
        )
        .handle("create", ({ payload }) =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            return yield* apiKeysService.create(tenant.orgId, tenant.userId, {
              name: payload.name,
              description: payload.description,
              expiresInSeconds: payload.expiresInSeconds,
            })
          }),
        )
        .handle("revoke", ({ path }) =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            return yield* apiKeysService.revoke(tenant.orgId, path.keyId)
          }),
        )
    }),
)
