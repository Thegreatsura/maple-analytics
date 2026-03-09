import { SqliteDrizzle } from "@effect/sql-drizzle/Sqlite"
import {
  DashboardDeleteResponse,
  DashboardId,
  DashboardNotFoundError,
  DashboardPersistenceError,
  DashboardValidationError,
  DashboardDocument,
  OrgId,
  UserId,
} from "@maple/domain/http"
import { dashboards } from "@maple/db"
import { and, desc, eq } from "drizzle-orm"
import { Effect, Layer, Option, Schema } from "effect"
import { DatabaseLive } from "./DatabaseLive"

const decodeDashboardDocument = Schema.decodeUnknown(Schema.Array(DashboardDocument))
const decodeDashboardIdSync = Schema.decodeUnknownSync(DashboardId)

const toPersistenceError = (error: unknown) =>
  new DashboardPersistenceError({
    message:
      error instanceof Error ? error.message : "Dashboard persistence failed",
  })

const parseTimestamp = (field: "createdAt" | "updatedAt", value: string) => {
  const timestamp = Date.parse(value)

  if (!Number.isFinite(timestamp)) {
    return Effect.fail(
      new DashboardValidationError({
        message: `Invalid ${field} timestamp`,
        details: [`${field} must be an ISO date-time string`],
      }),
    )
  }

  return Effect.succeed(timestamp)
}

const parsePayload = (payloadJson: string) =>
  Effect.try({
    try: () => JSON.parse(payloadJson),
    catch: () =>
      new DashboardPersistenceError({
        message: "Stored dashboard payload is invalid JSON",
      }),
  })

const stringifyPayload = (dashboard: DashboardDocument) =>
  Effect.try({
    try: () => JSON.stringify(dashboard),
    catch: () =>
      new DashboardValidationError({
        message: "Dashboard payload must be JSON serializable",
        details: ["Dashboard contains non-serializable values"],
      }),
  })

export class DashboardPersistenceService extends Effect.Service<DashboardPersistenceService>()(
  "DashboardPersistenceService",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const db = yield* SqliteDrizzle

      const list = Effect.fn("DashboardPersistenceService.list")(function* (
        orgId: OrgId,
      ) {
        const rows = yield* db
          .select({
            payloadJson: dashboards.payloadJson,
          })
          .from(dashboards)
          .where(eq(dashboards.orgId, orgId))
          .orderBy(desc(dashboards.updatedAt))
          .pipe(Effect.mapError(toPersistenceError))

        const payloads = yield* Effect.forEach(rows, (row) =>
          parsePayload(row.payloadJson),
        )

        return yield* decodeDashboardDocument(payloads).pipe(
          Effect.mapError(() =>
            new DashboardPersistenceError({
              message: "Stored dashboard payload does not match schema",
            }),
          ),
        )
      })

      const upsert = Effect.fn("DashboardPersistenceService.upsert")(function* (
        orgId: OrgId,
        userId: UserId,
        dashboard: DashboardDocument,
      ) {
        const payloadJson = yield* stringifyPayload(dashboard)
        const createdAt = yield* parseTimestamp("createdAt", dashboard.createdAt)
        const updatedAt = yield* parseTimestamp("updatedAt", dashboard.updatedAt)

        yield* db
          .insert(dashboards)
          .values({
            orgId,
            id: dashboard.id,
            name: dashboard.name,
            payloadJson,
            createdAt,
            updatedAt,
            createdBy: userId,
            updatedBy: userId,
          })
          .onConflictDoUpdate({
            target: [dashboards.orgId, dashboards.id],
            set: {
              name: dashboard.name,
              payloadJson,
              updatedAt,
              updatedBy: userId,
            },
          })
          .pipe(Effect.mapError(toPersistenceError))

        return dashboard
      })

      const remove = Effect.fn("DashboardPersistenceService.delete")(function* (
        orgId: OrgId,
        dashboardId: DashboardId,
      ) {
        const rows = yield* db
          .delete(dashboards)
          .where(
            and(
              eq(dashboards.orgId, orgId),
              eq(dashboards.id, dashboardId),
            ),
          )
          .returning({ id: dashboards.id })
          .pipe(Effect.mapError(toPersistenceError))

        const deleted = Option.fromNullable(rows[0])

        if (Option.isNone(deleted)) {
          return yield* Effect.fail(
            new DashboardNotFoundError({
              dashboardId,
              message: "Dashboard not found",
            }),
          )
        }

        return new DashboardDeleteResponse({
          id: decodeDashboardIdSync(deleted.value.id),
        })
      })

      return {
        list,
        upsert,
        delete: remove,
      }
    }),
  },
) {
  static readonly Live = this.Default.pipe(Layer.provide(DatabaseLive))
}
