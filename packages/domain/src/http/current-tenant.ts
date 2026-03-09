import { HttpApiMiddleware, HttpApiSchema, HttpApiSecurity } from "@effect/platform"
import { Context, Schema } from "effect"
import { AuthMode, OrgId, RoleName, UserId } from "../primitives"

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 401 }),
) {}

export class TenantSchema extends Schema.Class<TenantSchema>("TenantSchema")({
  orgId: OrgId,
  userId: UserId,
  roles: Schema.Array(RoleName),
  authMode: AuthMode,
}) {}

export class Context_ extends Context.Tag("CurrentTenant")<Context_, TenantSchema>() {}
export { Context_ as Context }

export class Authorization extends HttpApiMiddleware.Tag<Authorization>()("Authorization", {
  failure: UnauthorizedError,
  provides: Context_,
  security: {
    bearer: HttpApiSecurity.bearer,
  },
}) {}
