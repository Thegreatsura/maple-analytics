import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"

export class PrometheusSDTarget extends Schema.Class<PrometheusSDTarget>("PrometheusSDTarget")({
  targets: Schema.Array(Schema.String),
  labels: Schema.Record({ key: Schema.String, value: Schema.String }),
}) {}

export class SDUnauthorizedError extends Schema.TaggedError<SDUnauthorizedError>()(
  "SDUnauthorizedError",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 401 }),
) {}

export class SDPersistenceError extends Schema.TaggedError<SDPersistenceError>()(
  "SDPersistenceError",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 503 }),
) {}

export class ServiceDiscoveryApiGroup extends HttpApiGroup.make("serviceDiscovery")
  .add(
    HttpApiEndpoint.get("prometheus", "/prometheus")
      .addSuccess(Schema.Array(PrometheusSDTarget))
      .addError(SDUnauthorizedError)
      .addError(SDPersistenceError),
  )
  .prefix("/api/internal/sd") {}
