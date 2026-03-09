import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { ApiKeyId, UserId } from "../primitives"
import { Authorization } from "./current-tenant"

const ApiKeyPath = Schema.Struct({
  keyId: ApiKeyId,
})

export class ApiKeyResponse extends Schema.Class<ApiKeyResponse>("ApiKeyResponse")({
  id: ApiKeyId,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  keyPrefix: Schema.String,
  revoked: Schema.Boolean,
  revokedAt: Schema.NullOr(Schema.Number),
  lastUsedAt: Schema.NullOr(Schema.Number),
  expiresAt: Schema.NullOr(Schema.Number),
  createdAt: Schema.Number,
  createdBy: UserId,
}) {}

export class ApiKeyCreatedResponse extends Schema.Class<ApiKeyCreatedResponse>("ApiKeyCreatedResponse")({
  id: ApiKeyId,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  keyPrefix: Schema.String,
  revoked: Schema.Boolean,
  revokedAt: Schema.NullOr(Schema.Number),
  lastUsedAt: Schema.NullOr(Schema.Number),
  expiresAt: Schema.NullOr(Schema.Number),
  createdAt: Schema.Number,
  createdBy: UserId,
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
    keyId: ApiKeyId,
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
