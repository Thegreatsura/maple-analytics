import { HttpServerRequest } from "effect/unstable/http"
import { CurrentTenant, RoleName, UnauthorizedError } from "@maple/domain/http"
import { Effect, Layer, Option, Schema } from "effect"
import { ApiKeysService } from "./ApiKeysService"
import { makeResolveTenant } from "./AuthService"
import { annotateAuthSpan } from "../lib/auth-span"
import { Env } from "../lib/Env"

const decodeRoleNameSync = Schema.decodeUnknownSync(RoleName)
const apiKeyDefaultRoles = [decodeRoleNameSync("root")] as const

const getBearerToken = (headers: Record<string, string | undefined>): string | undefined => {
	const header = headers["authorization"] ?? headers["Authorization"]
	if (!header) return undefined
	const [scheme, token] = header.split(" ")
	if (!scheme || !token || scheme.toLowerCase() !== "bearer") return undefined
	return token
}

export const ApiAuthorizationLayer = Layer.effect(
	CurrentTenant.Authorization,
	Effect.gen(function* () {
		const env = yield* Env
		const apiKeys = yield* ApiKeysService
		const resolveTenant = makeResolveTenant(env)

		return CurrentTenant.Authorization.of({
			bearer: (httpEffect) =>
				Effect.gen(function* () {
					const request = yield* HttpServerRequest.HttpServerRequest

					const token = getBearerToken(request.headers)
					const apiKeyResolved = yield* apiKeys.resolveByBearer(token).pipe(
						Effect.mapError(
							(error) =>
								new UnauthorizedError({
									message: error.message || "API key validation failed",
								}),
						),
					)

					if (Option.isSome(apiKeyResolved)) {
						yield* annotateAuthSpan("api_key", {
							orgId: apiKeyResolved.value.orgId,
							userId: apiKeyResolved.value.userId,
							keyId: apiKeyResolved.value.keyId,
						})
						const tenant = new CurrentTenant.TenantSchema({
							orgId: apiKeyResolved.value.orgId,
							userId: apiKeyResolved.value.userId,
							roles: apiKeyDefaultRoles,
							authMode: "self_hosted",
						})
						return yield* Effect.provideService(httpEffect, CurrentTenant.Context, tenant)
					}

					const tenant = yield* resolveTenant(request.headers)
					yield* annotateAuthSpan("session", { orgId: tenant.orgId, userId: tenant.userId })
					return yield* Effect.provideService(
						httpEffect,
						CurrentTenant.Context,
						new CurrentTenant.TenantSchema(tenant),
					)
				}),
		})
	}),
)
