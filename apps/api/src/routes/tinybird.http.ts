import { HttpApiBuilder } from "effect/unstable/httpapi"
import { CurrentTenant, MapleApi } from "@maple/domain/http"
import { Effect } from "effect"
import { TinybirdService } from "../services/TinybirdService"

export const HttpTinybirdLive = HttpApiBuilder.group(MapleApi, "tinybird", (handlers) =>
  Effect.gen(function* () {
    const tinybird = yield* TinybirdService

    return handlers.handle("query", ({ payload }) =>
      Effect.gen(function* () {
        const tenant = yield* CurrentTenant.Context
        return yield* tinybird.query(tenant, payload)
      }),
    )
  }),
)
