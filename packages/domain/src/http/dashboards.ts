import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { Schema } from "effect"
import { DashboardId, IsoDateTimeString } from "../primitives"
import { Authorization } from "./current-tenant"

const TimeRangeSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("relative"),
    value: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("absolute"),
    startTime: IsoDateTimeString,
    endTime: IsoDateTimeString,
  }),
])

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

export class DashboardPersistenceError extends Schema.TaggedErrorClass<DashboardPersistenceError>()(
  "DashboardPersistenceError",
  {
    message: Schema.String,
  },
  { httpApiStatus: 503 },
) {}

export class DashboardNotFoundError extends Schema.TaggedErrorClass<DashboardNotFoundError>()(
  "DashboardNotFoundError",
  {
    dashboardId: DashboardId,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class DashboardValidationError extends Schema.TaggedErrorClass<DashboardValidationError>()(
  "DashboardValidationError",
  {
    message: Schema.String,
    details: Schema.Array(Schema.String),
  },
  { httpApiStatus: 400 },
) {}

export class DashboardsApiGroup extends HttpApiGroup.make("dashboards")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: DashboardsListResponse,
      error: DashboardPersistenceError,
    }),
  )
  .add(
    HttpApiEndpoint.put("upsert", "/:dashboardId", {
      params: {
        dashboardId: DashboardId,
      },
      payload: DashboardUpsertRequest,
      success: DashboardDocument,
      error: [DashboardValidationError, DashboardPersistenceError],
    }),
  )
  .add(
    HttpApiEndpoint.delete("delete", "/:dashboardId", {
      params: {
        dashboardId: DashboardId,
      },
      success: DashboardDeleteResponse,
      error: [DashboardNotFoundError, DashboardPersistenceError],
    }),
  )
  .prefix("/api/dashboards")
  .middleware(Authorization) {}
