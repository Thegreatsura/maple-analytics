import { Config, Effect, Layer, Option, Redacted } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { Otlp } from "effect/unstable/observability"

export const makeTelemetryLayer = (serviceName: string) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const otelBaseUrl = yield* Config.option(Config.string("OTEL_BASE_URL"))
      const otelEnvironment = yield* Config.option(Config.string("OTEL_ENVIRONMENT"))
      const otelIngestKey = yield* Config.option(Config.redacted("MAPLE_OTEL_INGEST_KEY"))
      const commitSha = yield* Config.option(Config.string("COMMIT_SHA"))

      const env = Option.getOrElse(otelEnvironment, () => "local")
      if (env === "local" || Option.isNone(otelBaseUrl)) return Layer.empty

      return Otlp.layerJson({
        baseUrl: otelBaseUrl.value,
        resource: {
          serviceName,
          serviceVersion: Option.getOrElse(commitSha, () => "dev"),
          attributes: { "deployment.environment": env },
        },
        headers: Option.match(otelIngestKey, {
          onNone: () => undefined,
          onSome: (key) => ({ Authorization: `Bearer ${Redacted.value(key)}` }),
        }),
      }).pipe(Layer.provide(FetchHttpClient.layer))
    }),
  )

export const TracerLive = makeTelemetryLayer("maple-api")
