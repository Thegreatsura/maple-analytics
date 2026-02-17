import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { randomUUID } from "node:crypto"
import { SqliteDrizzle } from "@effect/sql-drizzle/Sqlite"
import {
  ScrapeTargetEncryptionError,
  ScrapeTargetNotFoundError,
  ScrapeTargetPersistenceError,
  ScrapeTargetResponse,
  ScrapeTargetValidationError,
  type CreateScrapeTargetRequest,
  type UpdateScrapeTargetRequest,
} from "@maple/domain/http"
import { scrapeTargets } from "@maple/db"
import { and, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { DatabaseLive } from "./DatabaseLive"
import { Env } from "./Env"

const toPersistenceError = (error: unknown) =>
  new ScrapeTargetPersistenceError({
    message:
      error instanceof Error ? error.message : "Scrape target persistence failed",
  })

const toEncryptionError = (message: string) =>
  new ScrapeTargetEncryptionError({ message })

const parseEncryptionKey = (
  raw: string,
): Effect.Effect<Buffer, ScrapeTargetEncryptionError> =>
  Effect.try({
    try: () => {
      const trimmed = raw.trim()
      if (trimmed.length === 0) {
        throw new Error("MAPLE_INGEST_KEY_ENCRYPTION_KEY is required")
      }
      const decoded = Buffer.from(trimmed, "base64")
      if (decoded.length !== 32) {
        throw new Error(
          "MAPLE_INGEST_KEY_ENCRYPTION_KEY must be base64 for exactly 32 bytes",
        )
      }
      return decoded
    },
    catch: (error) =>
      toEncryptionError(
        error instanceof Error ? error.message : "Invalid encryption key",
      ),
  })

const encryptCredentials = (
  plaintext: string,
  encryptionKey: Buffer,
): Effect.Effect<
  { ciphertext: string; iv: string; tag: string },
  ScrapeTargetEncryptionError
> =>
  Effect.try({
    try: () => {
      const iv = randomBytes(12)
      const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv)
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ])
      return {
        ciphertext: ciphertext.toString("base64"),
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
      }
    },
    catch: (error) =>
      toEncryptionError(
        error instanceof Error ? error.message : "Failed to encrypt credentials",
      ),
  })

const decryptCredentials = (
  row: { authCredentialsCiphertext: string; authCredentialsIv: string; authCredentialsTag: string },
  encryptionKey: Buffer,
): Effect.Effect<string, ScrapeTargetEncryptionError> =>
  Effect.try({
    try: () => {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        encryptionKey,
        Buffer.from(row.authCredentialsIv, "base64"),
      )
      decipher.setAuthTag(Buffer.from(row.authCredentialsTag, "base64"))
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(row.authCredentialsCiphertext, "base64")),
        decipher.final(),
      ])
      return plaintext.toString("utf8")
    },
    catch: () => toEncryptionError("Failed to decrypt auth credentials"),
  })

const VALID_AUTH_TYPES = ["none", "bearer", "basic"] as const

const validateAuthType = (authType: string | undefined) => {
  if (authType === undefined) return Effect.succeed(undefined)
  if (!(VALID_AUTH_TYPES as readonly string[]).includes(authType)) {
    return Effect.fail(
      new ScrapeTargetValidationError({
        message: `Invalid auth type: "${authType}". Must be one of: ${VALID_AUTH_TYPES.join(", ")}`,
      }),
    )
  }
  return Effect.succeed(authType as (typeof VALID_AUTH_TYPES)[number])
}

const validateAuthCredentials = (
  authType: string,
  authCredentials: string | null | undefined,
) => {
  if (authType === "none") return Effect.succeed(undefined)

  if (!authCredentials) {
    return Effect.fail(
      new ScrapeTargetValidationError({
        message: `Credentials are required for auth type "${authType}"`,
      }),
    )
  }

  try {
    const parsed = JSON.parse(authCredentials)
    if (authType === "bearer") {
      if (!parsed.token || typeof parsed.token !== "string") {
        return Effect.fail(
          new ScrapeTargetValidationError({
            message: 'Bearer auth credentials must include a "token" string field',
          }),
        )
      }
    } else if (authType === "basic") {
      if (!parsed.username || typeof parsed.username !== "string" ||
          !parsed.password || typeof parsed.password !== "string") {
        return Effect.fail(
          new ScrapeTargetValidationError({
            message: 'Basic auth credentials must include "username" and "password" string fields',
          }),
        )
      }
    }
  } catch {
    return Effect.fail(
      new ScrapeTargetValidationError({
        message: "Auth credentials must be valid JSON",
      }),
    )
  }

  return Effect.succeed(authCredentials)
}

const rowToResponse = (row: typeof scrapeTargets.$inferSelect) =>
  new ScrapeTargetResponse({
    id: row.id,
    name: row.name,
    serviceName: row.serviceName ?? null,
    url: row.url,
    scrapeIntervalSeconds: row.scrapeIntervalSeconds,
    labelsJson: row.labelsJson,
    authType: row.authType,
    hasCredentials: row.authCredentialsCiphertext !== null,
    enabled: row.enabled === 1,
    lastScrapeAt: row.lastScrapeAt ? new Date(row.lastScrapeAt).toISOString() : null,
    lastScrapeError: row.lastScrapeError,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  })

const MIN_SCRAPE_INTERVAL = 5
const MAX_SCRAPE_INTERVAL = 300

const validateUrl = (url: string) => {
  const trimmed = url.trim()
  if (!trimmed) {
    return Effect.fail(new ScrapeTargetValidationError({ message: "URL is required" }))
  }
  try {
    new URL(trimmed)
  } catch {
    return Effect.fail(
      new ScrapeTargetValidationError({ message: `Invalid URL: ${trimmed}` }),
    )
  }
  return Effect.succeed(trimmed)
}

const validateInterval = (seconds: number | undefined) => {
  if (seconds === undefined) return Effect.succeed(undefined)
  if (!Number.isInteger(seconds) || seconds < MIN_SCRAPE_INTERVAL || seconds > MAX_SCRAPE_INTERVAL) {
    return Effect.fail(
      new ScrapeTargetValidationError({
        message: `Scrape interval must be an integer between ${MIN_SCRAPE_INTERVAL} and ${MAX_SCRAPE_INTERVAL} seconds`,
      }),
    )
  }
  return Effect.succeed(seconds)
}

const validateLabelsJson = (labelsJson: string | null | undefined) => {
  if (labelsJson === undefined || labelsJson === null) return Effect.succeed(labelsJson)
  try {
    const parsed = JSON.parse(labelsJson)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Effect.fail(
        new ScrapeTargetValidationError({ message: "labelsJson must be a JSON object" }),
      )
    }
    for (const v of Object.values(parsed)) {
      if (typeof v !== "string") {
        return Effect.fail(
          new ScrapeTargetValidationError({ message: "labelsJson values must be strings" }),
        )
      }
    }
  } catch {
    return Effect.fail(
      new ScrapeTargetValidationError({ message: "labelsJson must be valid JSON" }),
    )
  }
  return Effect.succeed(labelsJson)
}

export class ScrapeTargetsService extends Effect.Service<ScrapeTargetsService>()(
  "ScrapeTargetsService",
  {
    accessors: true,
    dependencies: [Env.Default],
    effect: Effect.gen(function* () {
      const db = yield* SqliteDrizzle
      const env = yield* Env
      const encryptionKey = yield* parseEncryptionKey(
        env.MAPLE_INGEST_KEY_ENCRYPTION_KEY,
      )

      const list = Effect.fn("ScrapeTargetsService.list")(function* (
        orgId: string,
      ) {
        const rows = yield* db
          .select()
          .from(scrapeTargets)
          .where(eq(scrapeTargets.orgId, orgId))
          .pipe(Effect.mapError(toPersistenceError))

        return rows.map(rowToResponse)
      })

      const create = Effect.fn("ScrapeTargetsService.create")(function* (
        orgId: string,
        request: CreateScrapeTargetRequest,
      ) {
        const url = yield* validateUrl(request.url)
        yield* validateInterval(request.scrapeIntervalSeconds)
        yield* validateLabelsJson(request.labelsJson)

        const authType = (yield* validateAuthType(request.authType)) ?? "none"

        let credentialFields: {
          authCredentialsCiphertext: string | null
          authCredentialsIv: string | null
          authCredentialsTag: string | null
        } = {
          authCredentialsCiphertext: null,
          authCredentialsIv: null,
          authCredentialsTag: null,
        }

        if (authType !== "none") {
          yield* validateAuthCredentials(authType, request.authCredentials)
          const encrypted = yield* encryptCredentials(request.authCredentials!, encryptionKey)
          credentialFields = {
            authCredentialsCiphertext: encrypted.ciphertext,
            authCredentialsIv: encrypted.iv,
            authCredentialsTag: encrypted.tag,
          }
        }

        const now = Date.now()
        const id = randomUUID()

        yield* db
          .insert(scrapeTargets)
          .values({
            id,
            orgId,
            name: request.name.trim(),
            serviceName: request.serviceName ?? null,
            url,
            scrapeIntervalSeconds: request.scrapeIntervalSeconds ?? 15,
            labelsJson: request.labelsJson ?? null,
            authType,
            ...credentialFields,
            enabled: request.enabled === false ? 0 : 1,
            createdAt: now,
            updatedAt: now,
          })
          .pipe(Effect.mapError(toPersistenceError))

        const rows = yield* db
          .select()
          .from(scrapeTargets)
          .where(eq(scrapeTargets.id, id))
          .limit(1)
          .pipe(Effect.mapError(toPersistenceError))

        if (!rows[0]) {
          return yield* Effect.fail(
            new ScrapeTargetPersistenceError({
              message: "Failed to create scrape target",
            }),
          )
        }

        yield* Effect.fork(
          probe(orgId, id).pipe(Effect.catchAll(() => Effect.void)),
        )

        return rowToResponse(rows[0])
      })

      const update = Effect.fn("ScrapeTargetsService.update")(function* (
        orgId: string,
        targetId: string,
        request: UpdateScrapeTargetRequest,
      ) {
        const existing = yield* db
          .select()
          .from(scrapeTargets)
          .where(
            and(
              eq(scrapeTargets.orgId, orgId),
              eq(scrapeTargets.id, targetId),
            ),
          )
          .limit(1)
          .pipe(Effect.mapError(toPersistenceError))

        if (!existing[0]) {
          return yield* Effect.fail(
            new ScrapeTargetNotFoundError({
              targetId,
              message: "Scrape target not found",
            }),
          )
        }

        if (request.url !== undefined) {
          yield* validateUrl(request.url)
        }
        yield* validateInterval(request.scrapeIntervalSeconds)
        yield* validateLabelsJson(request.labelsJson)

        const now = Date.now()
        const updates: Record<string, unknown> = { updatedAt: now }

        if (request.name !== undefined) updates.name = request.name.trim()
        if (request.url !== undefined) updates.url = request.url.trim()
        if (request.scrapeIntervalSeconds !== undefined)
          updates.scrapeIntervalSeconds = request.scrapeIntervalSeconds
        if (request.labelsJson !== undefined) updates.labelsJson = request.labelsJson
        if (request.enabled !== undefined) updates.enabled = request.enabled ? 1 : 0
        if (request.serviceName !== undefined) updates.serviceName = request.serviceName

        // Handle auth type changes
        if (request.authType !== undefined) {
          const newAuthType = yield* validateAuthType(request.authType)
          updates.authType = newAuthType

          if (newAuthType === "none") {
            // Clearing auth — remove credentials
            updates.authCredentialsCiphertext = null
            updates.authCredentialsIv = null
            updates.authCredentialsTag = null
          } else if (newAuthType !== existing[0].authType || request.authCredentials) {
            // Auth type changed or new credentials provided — require and encrypt
            yield* validateAuthCredentials(newAuthType!, request.authCredentials)
            const encrypted = yield* encryptCredentials(request.authCredentials!, encryptionKey)
            updates.authCredentialsCiphertext = encrypted.ciphertext
            updates.authCredentialsIv = encrypted.iv
            updates.authCredentialsTag = encrypted.tag
          }
          // Same auth type, no new credentials — keep existing
        } else if (request.authCredentials) {
          // No auth type change but new credentials provided — re-encrypt for current type
          const currentAuthType = existing[0].authType
          if (currentAuthType !== "none") {
            yield* validateAuthCredentials(currentAuthType, request.authCredentials)
            const encrypted = yield* encryptCredentials(request.authCredentials!, encryptionKey)
            updates.authCredentialsCiphertext = encrypted.ciphertext
            updates.authCredentialsIv = encrypted.iv
            updates.authCredentialsTag = encrypted.tag
          }
        }

        yield* db
          .update(scrapeTargets)
          .set(updates)
          .where(
            and(
              eq(scrapeTargets.orgId, orgId),
              eq(scrapeTargets.id, targetId),
            ),
          )
          .pipe(Effect.mapError(toPersistenceError))

        const rows = yield* db
          .select()
          .from(scrapeTargets)
          .where(eq(scrapeTargets.id, targetId))
          .limit(1)
          .pipe(Effect.mapError(toPersistenceError))

        if (!rows[0]) {
          return yield* Effect.fail(
            new ScrapeTargetPersistenceError({
              message: "Failed to load updated scrape target",
            }),
          )
        }

        return rowToResponse(rows[0])
      })

      const remove = Effect.fn("ScrapeTargetsService.delete")(function* (
        orgId: string,
        targetId: string,
      ) {
        const rows = yield* db
          .delete(scrapeTargets)
          .where(
            and(
              eq(scrapeTargets.orgId, orgId),
              eq(scrapeTargets.id, targetId),
            ),
          )
          .returning({ id: scrapeTargets.id })
          .pipe(Effect.mapError(toPersistenceError))

        const deleted = rows[0]

        if (!deleted) {
          return yield* Effect.fail(
            new ScrapeTargetNotFoundError({
              targetId,
              message: "Scrape target not found",
            }),
          )
        }

        return { id: deleted.id }
      })

      const listAllEnabled = Effect.fn("ScrapeTargetsService.listAllEnabled")(function* () {
        const rows = yield* db
          .select()
          .from(scrapeTargets)
          .where(eq(scrapeTargets.enabled, 1))
          .pipe(Effect.mapError(toPersistenceError))

        return rows
      })

      const probe = Effect.fn("ScrapeTargetsService.probe")(function* (
        orgId: string,
        targetId: string,
      ) {
        const rows = yield* db
          .select()
          .from(scrapeTargets)
          .where(
            and(
              eq(scrapeTargets.orgId, orgId),
              eq(scrapeTargets.id, targetId),
            ),
          )
          .limit(1)
          .pipe(Effect.mapError(toPersistenceError))

        const row = rows[0]
        if (!row) {
          return yield* Effect.fail(
            new ScrapeTargetNotFoundError({ targetId, message: "Scrape target not found" }),
          )
        }

        const headers: Record<string, string> = {}
        if (
          row.authType !== "none" &&
          row.authCredentialsCiphertext &&
          row.authCredentialsIv &&
          row.authCredentialsTag
        ) {
          const credentialsJson = yield* decryptCredentials(
            {
              authCredentialsCiphertext: row.authCredentialsCiphertext,
              authCredentialsIv: row.authCredentialsIv,
              authCredentialsTag: row.authCredentialsTag,
            },
            encryptionKey,
          )
          const creds = JSON.parse(credentialsJson) as Record<string, string>
          if (row.authType === "bearer") {
            headers["Authorization"] = `Bearer ${creds.token}`
          } else if (row.authType === "basic") {
            const encoded = Buffer.from(`${creds.username}:${creds.password}`).toString("base64")
            headers["Authorization"] = `Basic ${encoded}`
          }
        }

        const now = Date.now()
        const result = yield* Effect.tryPromise({
          try: async () => {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 10_000)
            try {
              const response = await fetch(row.url, {
                method: "GET",
                headers,
                signal: controller.signal,
                redirect: "follow",
              })
              if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`)
              }
              return { success: true as const, error: null }
            } finally {
              clearTimeout(timeout)
            }
          },
          catch: (error) =>
            error instanceof Error ? error.message : "Connection failed",
        }).pipe(
          Effect.catchAll((errorMessage) =>
            Effect.succeed({ success: false as const, error: errorMessage }),
          ),
        )

        if (result.success) {
          yield* db
            .update(scrapeTargets)
            .set({ lastScrapeAt: now, lastScrapeError: null, updatedAt: now })
            .where(eq(scrapeTargets.id, targetId))
            .pipe(Effect.mapError(toPersistenceError))
        } else {
          yield* db
            .update(scrapeTargets)
            .set({ lastScrapeError: result.error, updatedAt: now })
            .where(eq(scrapeTargets.id, targetId))
            .pipe(Effect.mapError(toPersistenceError))
        }

        const updated = yield* db
          .select()
          .from(scrapeTargets)
          .where(eq(scrapeTargets.id, targetId))
          .limit(1)
          .pipe(Effect.mapError(toPersistenceError))

        return {
          success: result.success,
          lastScrapeAt: updated[0]?.lastScrapeAt
            ? new Date(updated[0].lastScrapeAt).toISOString()
            : null,
          lastScrapeError: updated[0]?.lastScrapeError ?? null,
        }
      })

      return {
        list,
        create,
        update,
        delete: remove,
        listAllEnabled,
        probe,
      }
    }),
  },
) {
  static readonly Live = this.Default.pipe(Layer.provide(DatabaseLive))
}
