import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { DashboardId, IsoDateTimeString } from "../primitives"
import { Authorization } from "./current-tenant"




const TimeRangeSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("relative"),
    value: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("absolute"),
    startTime: IsoDateTimeString,
    endTime: IsoDateTimeString,
  }),
)

const DashboardPath = Schema.Struct({
  dashboardId: DashboardId,
})

export class DashboardDocument extends Schema.Class<DashboardDocument>("DashboardDocument")({
  id: DashboardId,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  tags: Schema.optional(Schema.Array(Schema.String)),
  timeRange: TimeRangeSchema,
  variables: Schema.optional(Schema.Array(Schema.Any)),
  widgets: Schema.Array(Schema.Any),
  createdAt: IsoDateTimeString,
  updatedAt: IsoDateTimeString,
}) {}

export class DashboardsListResponse extends Schema.Class<DashboardsListResponse>("DashboardsListResponse")({
  dashboards: Schema.Array(DashboardDocument),
}) {}

export class DashboardUpsertRequest extends Schema.Class<DashboardUpsertRequest>("DashboardUpsertRequest")({
  dashboard: DashboardDocument,
}) {}

export class DashboardDeleteResponse extends Schema.Class<DashboardDeleteResponse>("DashboardDeleteResponse")({
  id: DashboardId,
}) {}

export class DashboardPersistenceError extends Schema.TaggedError<DashboardPersistenceError>()(
  "DashboardPersistenceError",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 503 }),
) {}

export class DashboardNotFoundError extends Schema.TaggedError<DashboardNotFoundError>()(
  "DashboardNotFoundError",
  {
    dashboardId: DashboardId,
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 404 }),
) {}

export class DashboardValidationError extends Schema.TaggedError<DashboardValidationError>()(
  "DashboardValidationError",
  {
    message: Schema.String,
    details: Schema.Array(Schema.String),
  },
  HttpApiSchema.annotations({ status: 400 }),
) {}

export class DashboardsApiGroup extends HttpApiGroup.make("dashboards")
  .add(
    HttpApiEndpoint.get("list", "/")
      .addSuccess(DashboardsListResponse)
      .addError(DashboardPersistenceError),
  )
  .add(
    HttpApiEndpoint.put("upsert", "/:dashboardId")
      .setPath(DashboardPath)
      .setPayload(DashboardUpsertRequest)
      .addSuccess(DashboardDocument)
      .addError(DashboardValidationError)
      .addError(DashboardPersistenceError),
  )
  .add(
    HttpApiEndpoint.del("delete", "/:dashboardId")
      .setPath(DashboardPath)
      .addSuccess(DashboardDeleteResponse)
      .addError(DashboardNotFoundError)
      .addError(DashboardPersistenceError),
  )
  .prefix("/api/dashboards")
  .middleware(Authorization) {}
