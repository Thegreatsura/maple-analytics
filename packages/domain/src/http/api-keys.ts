import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { Authorization } from "./current-tenant"

const ApiKeyPath = Schema.Struct({
  keyId: Schema.String,
})

export class ApiKeyResponse extends Schema.Class<ApiKeyResponse>("ApiKeyResponse")({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  keyPrefix: Schema.String,
  revoked: Schema.Boolean,
  revokedAt: Schema.NullOr(Schema.Number),
  lastUsedAt: Schema.NullOr(Schema.Number),
  expiresAt: Schema.NullOr(Schema.Number),
  createdAt: Schema.Number,
  createdBy: Schema.String,
}) {}

export class ApiKeyCreatedResponse extends Schema.Class<ApiKeyCreatedResponse>("ApiKeyCreatedResponse")({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  keyPrefix: Schema.String,
  revoked: Schema.Boolean,
  revokedAt: Schema.NullOr(Schema.Number),
  lastUsedAt: Schema.NullOr(Schema.Number),
  expiresAt: Schema.NullOr(Schema.Number),
  createdAt: Schema.Number,
  createdBy: Schema.String,
  secret: Schema.String,
}) {}

export class ApiKeysListResponse extends Schema.Class<ApiKeysListResponse>("ApiKeysListResponse")({
  keys: Schema.Array(ApiKeyResponse),
}) {}

export class CreateApiKeyRequest extends Schema.Class<CreateApiKeyRequest>("CreateApiKeyRequest")({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  expiresInSeconds: Schema.optional(Schema.Number),
}) {}

export class ApiKeyPersistenceError extends Schema.TaggedError<ApiKeyPersistenceError>()(
  "ApiKeyPersistenceError",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 503 }),
) {}

export class ApiKeyNotFoundError extends Schema.TaggedError<ApiKeyNotFoundError>()(
  "ApiKeyNotFoundError",
  {
    keyId: Schema.String,
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 404 }),
) {}

export class ApiKeysApiGroup extends HttpApiGroup.make("apiKeys")
  .add(
    HttpApiEndpoint.get("list", "/")
      .addSuccess(ApiKeysListResponse)
      .addError(ApiKeyPersistenceError),
  )
  .add(
    HttpApiEndpoint.post("create", "/")
      .setPayload(CreateApiKeyRequest)
      .addSuccess(ApiKeyCreatedResponse)
      .addError(ApiKeyPersistenceError),
  )
  .add(
    HttpApiEndpoint.del("revoke", "/:keyId/revoke")
      .setPath(ApiKeyPath)
      .addSuccess(ApiKeyResponse)
      .addError(ApiKeyNotFoundError)
      .addError(ApiKeyPersistenceError),
  )
  .prefix("/api/api-keys")
  .middleware(Authorization) {}
