import { randomUUID } from "node:crypto"
import { SqliteDrizzle } from "@effect/sql-drizzle/Sqlite"
import {
  ApiKeyCreatedResponse,
  ApiKeyNotFoundError,
  ApiKeyPersistenceError,
  ApiKeyResponse,
  ApiKeysListResponse,
} from "@maple/domain/http"
import {
  API_KEY_PREFIX,
  apiKeys,
  generateApiKey,
  hashApiKey,
  parseIngestKeyLookupHmacKey,
} from "@maple/db"
import { and, desc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { DatabaseLive } from "./DatabaseLive"
import { Env } from "./Env"

export interface ResolvedApiKey {
  readonly orgId: string
  readonly userId: string
  readonly keyId: string
}

const toPersistenceError = (error: unknown) =>
  new ApiKeyPersistenceError({
    message:
      error instanceof Error ? error.message : "API key persistence failed",
  })

const rowToResponse = (row: typeof apiKeys.$inferSelect): ApiKeyResponse =>
  new ApiKeyResponse({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    keyPrefix: row.keyPrefix,
    revoked: row.revoked,
    revokedAt: row.revokedAt ?? null,
    lastUsedAt: row.lastUsedAt ?? null,
    expiresAt: row.expiresAt ?? null,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  })

export class ApiKeysService extends Effect.Service<ApiKeysService>()(
  "ApiKeysService",
  {
    accessors: true,
    dependencies: [Env.Default],
    effect: Effect.gen(function* () {
      const db = yield* SqliteDrizzle
      const env = yield* Env
      const hmacKey = parseIngestKeyLookupHmacKey(env.MAPLE_INGEST_KEY_LOOKUP_HMAC_KEY)

      const list = Effect.fn("ApiKeysService.list")(function* (orgId: string) {
        const rows = yield* db
          .select()
          .from(apiKeys)
          .where(eq(apiKeys.orgId, orgId))
          .orderBy(desc(apiKeys.createdAt))
          .pipe(Effect.mapError(toPersistenceError))

        return new ApiKeysListResponse({
          keys: rows.map(rowToResponse),
        })
      })

      const create = Effect.fn("ApiKeysService.create")(function* (
        orgId: string,
        userId: string,
        params: { name: string; description?: string; expiresInSeconds?: number },
      ) {
        const id = randomUUID()
        const rawKey = generateApiKey()
        const keyHash = hashApiKey(rawKey, hmacKey)
        const keyPrefix = rawKey.slice(0, 12) + "..."
        const now = Date.now()
        const expiresAt = params.expiresInSeconds
          ? now + params.expiresInSeconds * 1000
          : undefined

        yield* db
          .insert(apiKeys)
          .values({
            id,
            orgId,
            name: params.name,
            description: params.description ?? null,
            keyHash,
            keyPrefix,
            expiresAt: expiresAt ?? null,
            createdAt: now,
            createdBy: userId,
          })
          .pipe(Effect.mapError(toPersistenceError))

        return new ApiKeyCreatedResponse({
          id,
          name: params.name,
          description: params.description ?? null,
          keyPrefix,
          revoked: false,
          revokedAt: null,
          lastUsedAt: null,
          expiresAt: expiresAt ?? null,
          createdAt: now,
          createdBy: userId,
          secret: rawKey,
        })
      })

      const revoke = Effect.fn("ApiKeysService.revoke")(function* (
        orgId: string,
        keyId: string,
      ) {
        const now = Date.now()

        const rows = yield* db
          .select()
          .from(apiKeys)
          .where(and(eq(apiKeys.id, keyId), eq(apiKeys.orgId, orgId)))
          .limit(1)
          .pipe(Effect.mapError(toPersistenceError))

        const row = rows[0]
        if (!row) {
          return yield* Effect.fail(
            new ApiKeyNotFoundError({ keyId, message: "API key not found" }),
          )
        }

        yield* db
          .update(apiKeys)
          .set({ revoked: true, revokedAt: now })
          .where(eq(apiKeys.id, keyId))
          .pipe(Effect.mapError(toPersistenceError))

        return rowToResponse({ ...row, revoked: true, revokedAt: now })
      })

      const resolveByKey = Effect.fn("ApiKeysService.resolveByKey")(function* (
        rawKey: string,
      ) {
        if (!rawKey.startsWith(API_KEY_PREFIX)) return null

        const keyHash = hashApiKey(rawKey, hmacKey)
        const rows = yield* db
          .select()
          .from(apiKeys)
          .where(eq(apiKeys.keyHash, keyHash))
          .limit(1)
          .pipe(Effect.mapError(toPersistenceError))

        const row = rows[0]
        if (!row) return null
        if (row.revoked) return null
        if (row.expiresAt && row.expiresAt < Date.now()) return null

        return {
          orgId: row.orgId,
          userId: row.createdBy,
          keyId: row.id,
        } satisfies ResolvedApiKey
      })

      const touchLastUsed = Effect.fn("ApiKeysService.touchLastUsed")(function* (
        keyId: string,
      ) {
        yield* db
          .update(apiKeys)
          .set({ lastUsedAt: Date.now() })
          .where(eq(apiKeys.id, keyId))
          .pipe(Effect.mapError(toPersistenceError))
      })

      return {
        list,
        create,
        revoke,
        resolveByKey,
        touchLastUsed,
      }
    }),
  },
) {
  static readonly Live = this.Default.pipe(Layer.provide(DatabaseLive))
}
