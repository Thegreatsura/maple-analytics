import { SqliteDrizzle } from "@effect/sql-drizzle/Sqlite"
import * as Sqlite from "@effect/sql-drizzle/Sqlite"
import { LibsqlClient } from "@effect/sql-libsql"
import { ensureMapleDbDirectory, resolveMapleDbConfig, runMigrations } from "@maple/db"
import { Effect, Layer, Option, Redacted } from "effect"
import { Env } from "./Env"

export const DatabaseLive: Layer.Layer<SqliteDrizzle, never, Env> = Layer.unwrapEffect(
  Effect.gen(function* () {
    const env = yield* Env

    const dbConfig = ensureMapleDbDirectory(
      resolveMapleDbConfig({
        MAPLE_DB_URL: env.MAPLE_DB_URL,
        MAPLE_DB_AUTH_TOKEN: Option.match(env.MAPLE_DB_AUTH_TOKEN, {
          onNone: () => undefined,
          onSome: Redacted.value,
        }),
      }),
    )

    yield* Effect.tryPromise(() => runMigrations(dbConfig)).pipe(
      Effect.tap(() => Effect.logInfo("[Database] Migrations complete")),
      Effect.orDie,
    )

    return Sqlite.layer.pipe(
      Layer.provide(
        LibsqlClient.layer({
          url: dbConfig.url,
          authToken: dbConfig.authToken ? Redacted.make(dbConfig.authToken) : undefined,
        }),
      ),
      Layer.orDie,
    )
  }),
)
