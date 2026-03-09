import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { OrgId, UserId } from "../primitives"
import { Authorization, TenantSchema } from "./current-tenant"

export class SelfHostedLoginRequest extends Schema.Class<SelfHostedLoginRequest>("SelfHostedLoginRequest")({
  password: Schema.String,
}) {}

export class SelfHostedLoginResponse extends Schema.Class<SelfHostedLoginResponse>("SelfHostedLoginResponse")({
  token: Schema.String,
  orgId: OrgId,
  userId: UserId,
}) {}

export class SelfHostedAuthDisabledError extends Schema.TaggedError<SelfHostedAuthDisabledError>()(
  "SelfHostedAuthDisabledError",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 400 }),
) {}

export class SelfHostedInvalidPasswordError extends Schema.TaggedError<SelfHostedInvalidPasswordError>()(
  "SelfHostedInvalidPasswordError",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 401 }),
) {}

export class AuthPublicApiGroup extends HttpApiGroup.make("authPublic")
  .add(
    HttpApiEndpoint.post("login", "/login")
      .setPayload(SelfHostedLoginRequest)
      .addSuccess(SelfHostedLoginResponse)
      .addError(SelfHostedAuthDisabledError)
      .addError(SelfHostedInvalidPasswordError),
  )
  .prefix("/api/auth") {}

export class AuthApiGroup extends HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.get("session", "/session")
      .addSuccess(TenantSchema),
  )
  .prefix("/api/auth")
  .middleware(Authorization) {}
