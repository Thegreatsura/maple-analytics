import { randomUUID } from "node:crypto"
import { SqliteDrizzle } from "@effect/sql-drizzle/Sqlite"
import {
  ScrapeTargetNotFoundError,
  ScrapeTargetPersistenceError,
  ScrapeTargetResponse,
  ScrapeTargetValidationError,
  type CreateScrapeTargetRequest,
  type UpdateScrapeTargetRequest,
} from "@maple/domain/http"
import { scrapeTargets } from "@maple/db"
import { and, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { DatabaseLive } from "./DatabaseLive"

const toPersistenceError = (error: unknown) =>
  new ScrapeTargetPersistenceError({
    message:
      error instanceof Error ? error.message : "Scrape target persistence failed",
  })

const rowToResponse = (row: typeof scrapeTargets.$inferSelect) =>
  new ScrapeTargetResponse({
    id: row.id,
    name: row.name,
    url: row.url,
    scrapeIntervalSeconds: row.scrapeIntervalSeconds,
    labelsJson: row.labelsJson,
    authType: row.authType,
    enabled: row.enabled === 1,
    lastScrapeAt: row.lastScrapeAt ? new Date(row.lastScrapeAt).toISOString() : null,
    lastScrapeError: row.lastScrapeError,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  })

const MIN_SCRAPE_INTERVAL = 5
const MAX_SCRAPE_INTERVAL = 300

const validateUrl = (url: string) => {
  const trimmed = url.trim()
  if (!trimmed) {
    return Effect.fail(new ScrapeTargetValidationError({ message: "URL is required" }))
  }
  try {
    new URL(trimmed)
  } catch {
    return Effect.fail(
      new ScrapeTargetValidationError({ message: `Invalid URL: ${trimmed}` }),
    )
  }
  return Effect.succeed(trimmed)
}

const validateInterval = (seconds: number | undefined) => {
  if (seconds === undefined) return Effect.succeed(undefined)
  if (!Number.isInteger(seconds) || seconds < MIN_SCRAPE_INTERVAL || seconds > MAX_SCRAPE_INTERVAL) {
    return Effect.fail(
      new ScrapeTargetValidationError({
        message: `Scrape interval must be an integer between ${MIN_SCRAPE_INTERVAL} and ${MAX_SCRAPE_INTERVAL} seconds`,
      }),
    )
  }
  return Effect.succeed(seconds)
}

const validateLabelsJson = (labelsJson: string | null | undefined) => {
  if (labelsJson === undefined || labelsJson === null) return Effect.succeed(labelsJson)
  try {
    const parsed = JSON.parse(labelsJson)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Effect.fail(
        new ScrapeTargetValidationError({ message: "labelsJson must be a JSON object" }),
      )
    }
    for (const v of Object.values(parsed)) {
      if (typeof v !== "string") {
        return Effect.fail(
          new ScrapeTargetValidationError({ message: "labelsJson values must be strings" }),
        )
      }
    }
  } catch {
    return Effect.fail(
      new ScrapeTargetValidationError({ message: "labelsJson must be valid JSON" }),
    )
  }
  return Effect.succeed(labelsJson)
}

export class ScrapeTargetsService extends Effect.Service<ScrapeTargetsService>()(
  "ScrapeTargetsService",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const db = yield* SqliteDrizzle

      const list = Effect.fn("ScrapeTargetsService.list")(function* (
        orgId: string,
      ) {
        const rows = yield* db
          .select()
          .from(scrapeTargets)
          .where(eq(scrapeTargets.orgId, orgId))
          .pipe(Effect.mapError(toPersistenceError))

        return rows.map(rowToResponse)
      })

      const create = Effect.fn("ScrapeTargetsService.create")(function* (
        orgId: string,
        request: CreateScrapeTargetRequest,
      ) {
        const url = yield* validateUrl(request.url)
        yield* validateInterval(request.scrapeIntervalSeconds)
        yield* validateLabelsJson(request.labelsJson)

        const now = Date.now()
        const id = randomUUID()

        yield* db
          .insert(scrapeTargets)
          .values({
            id,
            orgId,
            name: request.name.trim(),
            url,
            scrapeIntervalSeconds: request.scrapeIntervalSeconds ?? 15,
            labelsJson: request.labelsJson ?? null,
            authType: request.authType ?? "none",
            enabled: request.enabled === false ? 0 : 1,
            createdAt: now,
            updatedAt: now,
          })
          .pipe(Effect.mapError(toPersistenceError))

        const rows = yield* db
          .select()
          .from(scrapeTargets)
          .where(eq(scrapeTargets.id, id))
          .limit(1)
          .pipe(Effect.mapError(toPersistenceError))

        if (!rows[0]) {
          return yield* Effect.fail(
            new ScrapeTargetPersistenceError({
              message: "Failed to create scrape target",
            }),
          )
        }

        return rowToResponse(rows[0])
      })

      const update = Effect.fn("ScrapeTargetsService.update")(function* (
        orgId: string,
        targetId: string,
        request: UpdateScrapeTargetRequest,
      ) {
        const existing = yield* db
          .select()
          .from(scrapeTargets)
          .where(
            and(
              eq(scrapeTargets.orgId, orgId),
              eq(scrapeTargets.id, targetId),
            ),
          )
          .limit(1)
          .pipe(Effect.mapError(toPersistenceError))

        if (!existing[0]) {
          return yield* Effect.fail(
            new ScrapeTargetNotFoundError({
              targetId,
              message: "Scrape target not found",
            }),
          )
        }

        if (request.url !== undefined) {
          yield* validateUrl(request.url)
        }
        yield* validateInterval(request.scrapeIntervalSeconds)
        yield* validateLabelsJson(request.labelsJson)

        const now = Date.now()
        const updates: Record<string, unknown> = { updatedAt: now }

        if (request.name !== undefined) updates.name = request.name.trim()
        if (request.url !== undefined) updates.url = request.url.trim()
        if (request.scrapeIntervalSeconds !== undefined)
          updates.scrapeIntervalSeconds = request.scrapeIntervalSeconds
        if (request.labelsJson !== undefined) updates.labelsJson = request.labelsJson
        if (request.authType !== undefined) updates.authType = request.authType
        if (request.enabled !== undefined) updates.enabled = request.enabled ? 1 : 0

        yield* db
          .update(scrapeTargets)
          .set(updates)
          .where(
            and(
              eq(scrapeTargets.orgId, orgId),
              eq(scrapeTargets.id, targetId),
            ),
          )
          .pipe(Effect.mapError(toPersistenceError))

        const rows = yield* db
          .select()
          .from(scrapeTargets)
          .where(eq(scrapeTargets.id, targetId))
          .limit(1)
          .pipe(Effect.mapError(toPersistenceError))

        if (!rows[0]) {
          return yield* Effect.fail(
            new ScrapeTargetPersistenceError({
              message: "Failed to load updated scrape target",
            }),
          )
        }

        return rowToResponse(rows[0])
      })

      const remove = Effect.fn("ScrapeTargetsService.delete")(function* (
        orgId: string,
        targetId: string,
      ) {
        const rows = yield* db
          .delete(scrapeTargets)
          .where(
            and(
              eq(scrapeTargets.orgId, orgId),
              eq(scrapeTargets.id, targetId),
            ),
          )
          .returning({ id: scrapeTargets.id })
          .pipe(Effect.mapError(toPersistenceError))

        const deleted = rows[0]

        if (!deleted) {
          return yield* Effect.fail(
            new ScrapeTargetNotFoundError({
              targetId,
              message: "Scrape target not found",
            }),
          )
        }

        return { id: deleted.id }
      })

      const listAllEnabled = Effect.fn("ScrapeTargetsService.listAllEnabled")(function* () {
        const rows = yield* db
          .select()
          .from(scrapeTargets)
          .where(eq(scrapeTargets.enabled, 1))
          .pipe(Effect.mapError(toPersistenceError))

        return rows
      })

      return {
        list,
        create,
        update,
        delete: remove,
        listAllEnabled,
      }
    }),
  },
) {
  static readonly Live = this.Default.pipe(Layer.provide(DatabaseLive))
}
