import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { Authorization } from "./current-tenant"

const ScrapeTargetPath = Schema.Struct({
  targetId: Schema.String,
})

export class ScrapeTargetResponse extends Schema.Class<ScrapeTargetResponse>("ScrapeTargetResponse")({
  id: Schema.String,
  name: Schema.String,
  serviceName: Schema.NullOr(Schema.String),
  url: Schema.String,
  scrapeIntervalSeconds: Schema.Number,
  labelsJson: Schema.NullOr(Schema.String),
  authType: Schema.String,
  hasCredentials: Schema.Boolean,
  enabled: Schema.Boolean,
  lastScrapeAt: Schema.NullOr(Schema.String),
  lastScrapeError: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
}) {}

export class ScrapeTargetsListResponse extends Schema.Class<ScrapeTargetsListResponse>(
  "ScrapeTargetsListResponse",
)({
  targets: Schema.Array(ScrapeTargetResponse),
}) {}

export class CreateScrapeTargetRequest extends Schema.Class<CreateScrapeTargetRequest>(
  "CreateScrapeTargetRequest",
)({
  name: Schema.String,
  url: Schema.String,
  scrapeIntervalSeconds: Schema.optional(Schema.Number),
  labelsJson: Schema.optional(Schema.NullOr(Schema.String)),
  authType: Schema.optional(Schema.String),
  serviceName: Schema.optional(Schema.NullOr(Schema.String)),
  authCredentials: Schema.optional(Schema.NullOr(Schema.String)),
  enabled: Schema.optional(Schema.Boolean),
}) {}

export class UpdateScrapeTargetRequest extends Schema.Class<UpdateScrapeTargetRequest>(
  "UpdateScrapeTargetRequest",
)({
  name: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  scrapeIntervalSeconds: Schema.optional(Schema.Number),
  labelsJson: Schema.optional(Schema.NullOr(Schema.String)),
  authType: Schema.optional(Schema.String),
  serviceName: Schema.optional(Schema.NullOr(Schema.String)),
  authCredentials: Schema.optional(Schema.NullOr(Schema.String)),
  enabled: Schema.optional(Schema.Boolean),
}) {}

export class ScrapeTargetDeleteResponse extends Schema.Class<ScrapeTargetDeleteResponse>(
  "ScrapeTargetDeleteResponse",
)({
  id: Schema.String,
}) {}

export class ScrapeTargetPersistenceError extends Schema.TaggedError<ScrapeTargetPersistenceError>()(
  "ScrapeTargetPersistenceError",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 503 }),
) {}

export class ScrapeTargetNotFoundError extends Schema.TaggedError<ScrapeTargetNotFoundError>()(
  "ScrapeTargetNotFoundError",
  {
    targetId: Schema.String,
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 404 }),
) {}

export class ScrapeTargetValidationError extends Schema.TaggedError<ScrapeTargetValidationError>()(
  "ScrapeTargetValidationError",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 400 }),
) {}

export class ScrapeTargetEncryptionError extends Schema.TaggedError<ScrapeTargetEncryptionError>()(
  "ScrapeTargetEncryptionError",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 500 }),
) {}

export class ScrapeTargetsApiGroup extends HttpApiGroup.make("scrapeTargets")
  .add(
    HttpApiEndpoint.get("list", "/")
      .addSuccess(ScrapeTargetsListResponse)
      .addError(ScrapeTargetPersistenceError),
  )
  .add(
    HttpApiEndpoint.post("create", "/")
      .setPayload(CreateScrapeTargetRequest)
      .addSuccess(ScrapeTargetResponse)
      .addError(ScrapeTargetValidationError)
      .addError(ScrapeTargetPersistenceError)
      .addError(ScrapeTargetEncryptionError),
  )
  .add(
    HttpApiEndpoint.patch("update", "/:targetId")
      .setPath(ScrapeTargetPath)
      .setPayload(UpdateScrapeTargetRequest)
      .addSuccess(ScrapeTargetResponse)
      .addError(ScrapeTargetNotFoundError)
      .addError(ScrapeTargetValidationError)
      .addError(ScrapeTargetPersistenceError)
      .addError(ScrapeTargetEncryptionError),
  )
  .add(
    HttpApiEndpoint.del("delete", "/:targetId")
      .setPath(ScrapeTargetPath)
      .addSuccess(ScrapeTargetDeleteResponse)
      .addError(ScrapeTargetNotFoundError)
      .addError(ScrapeTargetPersistenceError),
  )
  .prefix("/api/scrape-targets")
  .middleware(Authorization) {}
