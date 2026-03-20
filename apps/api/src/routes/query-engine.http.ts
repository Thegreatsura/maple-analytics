import { HttpApiBuilder } from "effect/unstable/httpapi"
import { CurrentTenant, MapleApi } from "@maple/domain/http"
import { Effect } from "effect"
import { QueryEngineService } from "../services/QueryEngineService"

export const HttpQueryEngineLive = HttpApiBuilder.group(MapleApi, "queryEngine", (handlers) =>
  Effect.gen(function* () {
    const queryEngine = yield* QueryEngineService

    return handlers.handle("execute", ({ payload }) =>
      Effect.gen(function* () {
        const tenant = yield* CurrentTenant.Context
        return yield* queryEngine.execute(tenant, payload)
      }),
    )
  }),
)
