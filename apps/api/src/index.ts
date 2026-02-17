import { HttpApiScalar, HttpLayerRouter, HttpServerResponse } from "@effect/platform"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { MapleApi } from "@maple/domain/http"
import { Config, Effect, Layer, ManagedRuntime } from "effect"
import { HttpApiRoutes } from "./http"
import { runWithTenantContext } from "@/lib/tenant-context"
import { mcpWebHandler } from "./mcp/app"
import { resolveMcpTenantContext } from "./mcp/lib/resolve-tenant"
import { AutumnRouter } from "./routes/autumn.http"
import { ApiKeysService } from "./services/ApiKeysService"
import { AuthorizationLive } from "./services/AuthorizationLive"
import { DashboardPersistenceService } from "./services/DashboardPersistenceService"
import { Env } from "./services/Env"
import { OrgIngestKeysService } from "./services/OrgIngestKeysService"
import { QueryEngineService } from "./services/QueryEngineService"
import { ScrapeTargetsService } from "./services/ScrapeTargetsService"
import { TinybirdService } from "./services/TinybirdService"
import { AuthService } from "./services/AuthService"

const HealthRouter = HttpLayerRouter.use((router) =>
  router.add("GET", "/health", HttpServerResponse.text("OK")),
)

const DocsRoute = HttpApiScalar.layerHttpLayerRouter({
  api: MapleApi,
  path: "/docs",
})

const AllRoutes = Layer.mergeAll(HttpApiRoutes, HealthRouter, DocsRoute, AutumnRouter).pipe(
  Layer.provideMerge(
    HttpLayerRouter.cors({
      allowedOrigins: ["*"],
      allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["*"],
      exposedHeaders: [],
    }),
  ),
)

const MainLive = Layer.mergeAll(
  Env.Default,
  TinybirdService.Default,
  QueryEngineService.Default,
  AuthService.Default,
  ApiKeysService.Live,
  DashboardPersistenceService.Live,
  OrgIngestKeysService.Live,
  ScrapeTargetsService.Live,
)

const mcpPort = await ManagedRuntime.make(Env.Default).runPromise(
  Effect.gen(function* () {
    return (yield* Env).MCP_PORT
  }),
)

Bun.serve({
  port: mcpPort,
  fetch: async (request) => {
    try {
      const tenant = await resolveMcpTenantContext(request)
      return await runWithTenantContext(tenant, () => mcpWebHandler.handler(request))
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Unauthorized",
        }),
        {
          status: 401,
          headers: {
            "content-type": "application/json",
          },
        },
      )
    }
  },
})

const app = HttpLayerRouter.serve(AllRoutes).pipe(
  Layer.provideMerge(MainLive),
  Layer.provide(
    AuthorizationLive.pipe(Layer.provideMerge(Env.Default)),
  ),
  Layer.provideMerge(
    BunHttpServer.layerConfig(
      Config.all({
        port: Config.number("PORT").pipe(Config.withDefault(3472)),
        idleTimeout: Config.succeed(120),
      }),
    ).pipe(Layer.orDie),
  ),
)

BunRuntime.runMain(Layer.launch(app))
