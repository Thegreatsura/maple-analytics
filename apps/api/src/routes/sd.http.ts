import { timingSafeEqual } from "node:crypto"
import { HttpApiBuilder, HttpServerRequest } from "@effect/platform"
import { MapleApi, SDPersistenceError, SDUnauthorizedError } from "@maple/domain/http"
import { Effect } from "effect"
import { Env } from "../services/Env"
import { ScrapeTargetsService } from "../services/ScrapeTargetsService"

export const HttpServiceDiscoveryLive = HttpApiBuilder.group(
  MapleApi,
  "serviceDiscovery",
  (handlers) =>
    Effect.gen(function* () {
      const env = yield* Env
      const service = yield* ScrapeTargetsService

      return handlers.handle("prometheus", () =>
        Effect.gen(function* () {
          const internalToken = env.SD_INTERNAL_TOKEN

          if (internalToken.length === 0) {
            return yield* Effect.fail(
              new SDUnauthorizedError({ message: "Service discovery endpoint not configured" }),
            )
          }

          const req = yield* HttpServerRequest.HttpServerRequest
          const authHeader = req.headers.authorization ?? ""
          const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""

          const isValid =
            provided.length === internalToken.length &&
            timingSafeEqual(Buffer.from(provided), Buffer.from(internalToken))

          if (!isValid) {
            return yield* Effect.fail(
              new SDUnauthorizedError({ message: "Unauthorized" }),
            )
          }

          const rows = yield* service.listAllEnabled().pipe(
            Effect.mapError(
              (e) => new SDPersistenceError({ message: e.message }),
            ),
          )

          const sdTargets: Array<{ targets: string[]; labels: Record<string, string> }> = []

          for (const row of rows) {
            let url: URL
            try {
              url = new URL(row.url)
            } catch {
              console.warn(`[sd] Skipping scrape target ${row.id} — invalid URL: ${row.url}`)
              continue
            }

            const labels: Record<string, string> = {
              __scheme__: url.protocol.replace(":", ""),
              __metrics_path__: url.pathname,
              __scrape_interval__: `${row.scrapeIntervalSeconds}s`,
              job: row.serviceName ?? row.name,
              maple_org_id: row.orgId,
              maple_scrape_target_id: row.id,
              maple_scrape_target_name: row.name,
            }

            if (row.labelsJson) {
              try {
                const extra = JSON.parse(row.labelsJson)
                if (extra && typeof extra === "object") {
                  for (const [k, v] of Object.entries(extra)) {
                    if (typeof v === "string") {
                      labels[k] = v
                    }
                  }
                }
              } catch {
                // ignore invalid labels JSON
              }
            }

            sdTargets.push({ targets: [url.host], labels })
          }

          return sdTargets
        }),
      )
    }),
)
