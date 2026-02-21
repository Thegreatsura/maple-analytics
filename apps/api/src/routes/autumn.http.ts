import { HttpLayerRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Effect } from "effect"
import { autumnHandler } from "autumn-js/backend"
import { Env } from "../services/Env"
import { AuthService } from "../services/AuthService"

export const AutumnRouter = HttpLayerRouter.use((router) =>
  Effect.gen(function* () {
    const env = yield* Env
    if (env.AUTUMN_SECRET_KEY.length === 0) return

    const secretKey = env.AUTUMN_SECRET_KEY

    const handle = (req: HttpServerRequest.HttpServerRequest) =>
      Effect.gen(function* () {
        const tenant = yield* AuthService.resolveTenant(
          req.headers as Record<string, string>,
        )

        let body: unknown = undefined
        if (req.method !== "GET" && req.method !== "HEAD") {
          body = yield* req.json
        }

        const result = yield* Effect.tryPromise(() =>
          autumnHandler({
            request: { url: req.url, method: req.method, body },
            customerId: tenant.orgId,
            clientOptions: { secretKey },
          }),
        )

        return yield* HttpServerResponse.json(result.response, {
          status: result.statusCode,
        })
      })

    const routes = [
      ["POST", "/api/autumn/customers"],
      ["GET", "/api/autumn/customers"],
      ["GET", "/api/autumn/components/pricing_table"],
      ["POST", "/api/autumn/checkout"],
      ["POST", "/api/autumn/attach"],
      ["POST", "/api/autumn/cancel"],
      ["POST", "/api/autumn/check"],
      ["POST", "/api/autumn/track"],
      ["POST", "/api/autumn/billing_portal"],
      ["POST", "/api/autumn/setup_payment"],
      ["POST", "/api/autumn/query"],
      ["POST", "/api/autumn/events/aggregate"],
      ["GET", "/api/autumn/products"],
    ] as const

    for (const [method, path] of routes) {
      yield* router.add(method, path, handle)
    }
  }),
)
