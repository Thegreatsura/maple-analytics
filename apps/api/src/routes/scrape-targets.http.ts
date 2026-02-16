import { HttpApiBuilder } from "@effect/platform"
import { CurrentTenant, MapleApi } from "@maple/domain/http"
import { Effect } from "effect"
import { ScrapeTargetsService } from "../services/ScrapeTargetsService"

export const HttpScrapeTargetsLive = HttpApiBuilder.group(
  MapleApi,
  "scrapeTargets",
  (handlers) =>
    Effect.gen(function* () {
      const service = yield* ScrapeTargetsService

      return handlers
        .handle("list", () =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            const targets = yield* service.list(tenant.orgId)
            return { targets }
          }),
        )
        .handle("create", ({ payload }) =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            return yield* service.create(tenant.orgId, payload)
          }),
        )
        .handle("update", ({ path, payload }) =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            return yield* service.update(
              tenant.orgId,
              path.targetId,
              payload,
            )
          }),
        )
        .handle("delete", ({ path }) =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            return yield* service.delete(tenant.orgId, path.targetId)
          }),
        )
    }),
)
