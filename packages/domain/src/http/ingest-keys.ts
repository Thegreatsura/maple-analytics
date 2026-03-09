import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { IsoDateTimeString } from "../primitives"
import { Authorization } from "./current-tenant"

export class IngestKeysResponse extends Schema.Class<IngestKeysResponse>("IngestKeysResponse")({
  publicKey: Schema.String,
  privateKey: Schema.String,
  publicRotatedAt: IsoDateTimeString,
  privateRotatedAt: IsoDateTimeString,
}) {}

export class IngestKeyPersistenceError extends Schema.TaggedError<IngestKeyPersistenceError>()(
  "IngestKeyPersistenceError",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 503 }),
) {}

export class IngestKeyEncryptionError extends Schema.TaggedError<IngestKeyEncryptionError>()(
  "IngestKeyEncryptionError",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 500 }),
) {}

export class IngestKeysApiGroup extends HttpApiGroup.make("ingestKeys")
  .add(
    HttpApiEndpoint.get("get", "/")
      .addSuccess(IngestKeysResponse)
      .addError(IngestKeyPersistenceError)
      .addError(IngestKeyEncryptionError),
  )
  .add(
    HttpApiEndpoint.post("rerollPublic", "/public/reroll")
      .addSuccess(IngestKeysResponse)
      .addError(IngestKeyPersistenceError)
      .addError(IngestKeyEncryptionError),
  )
  .add(
    HttpApiEndpoint.post("rerollPrivate", "/private/reroll")
      .addSuccess(IngestKeysResponse)
      .addError(IngestKeyPersistenceError)
      .addError(IngestKeyEncryptionError),
  )
  .prefix("/api/ingest-keys")
  .middleware(Authorization) {}
