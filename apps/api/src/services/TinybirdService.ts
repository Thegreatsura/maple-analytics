import {
  TinybirdQueryError,
  type TinybirdQueryRequest,
  TinybirdQueryResponse,
} from "@maple/domain/http"
import type { OrgId } from "@maple/domain"
import { Tinybird } from "@tinybirdco/sdk"
import { Effect, Layer, Option, Redacted, ServiceMap } from "effect"
import { Env } from "./Env"
import type { TenantContext } from "./AuthService"
import { OrgTinybirdSettingsService } from "./OrgTinybirdSettingsService"

const CLIENT_CACHE_TTL_MS = 30_000
interface CachedClient {
  client: TinybirdClient
  host: string
  token: string
  expiresAt: number
}

export interface TinybirdServiceShape {
  readonly query: (
    tenant: TenantContext,
    payload: TinybirdQueryRequest,
  ) => Effect.Effect<TinybirdQueryResponse, TinybirdQueryError>
  readonly sqlQuery: (
    tenant: TenantContext,
    sql: string,
  ) => Effect.Effect<ReadonlyArray<Record<string, unknown>>, TinybirdQueryError>
}
const clientCache = new Map<string, CachedClient>()
import {
  type CustomTracesBreakdownOutput,
  type CustomTracesBreakdownParams,
  type CustomTracesTimeseriesOutput,
  type CustomTracesTimeseriesParams,
  customTracesBreakdown,
  customTracesTimeseries,
  errorDetailTraces,
  errorRateByService,
  errorsByType,
  errorsFacets,
  errorsSummary,
  errorsTimeseries,
  getServiceUsage,
  listLogs,
  listMetrics,
  listTraces,
  logsCount,
  logsFacets,
  metricAttributeKeys,
  metricsSummary,
  serviceApdexTimeSeries,
  serviceDependencies,
  serviceOverview,
  serviceReleasesTimeline,
  servicesFacets,
  resourceAttributeKeys,
  resourceAttributeValues,
  spanAttributeKeys,
  spanAttributeValues,
  spanHierarchy,
  tracesDurationStats,
  tracesFacets,
} from "@maple/domain/tinybird"

const pipes = {
  list_traces: listTraces,
  span_hierarchy: spanHierarchy,
  list_logs: listLogs,
  logs_count: logsCount,
  logs_facets: logsFacets,
  error_rate_by_service: errorRateByService,
  get_service_usage: getServiceUsage,
  list_metrics: listMetrics,
  metrics_summary: metricsSummary,
  traces_facets: tracesFacets,
  traces_duration_stats: tracesDurationStats,
  service_overview: serviceOverview,
  services_facets: servicesFacets,
  service_releases_timeline: serviceReleasesTimeline,
  errors_by_type: errorsByType,
  error_detail_traces: errorDetailTraces,
  errors_facets: errorsFacets,
  errors_summary: errorsSummary,
  errors_timeseries: errorsTimeseries,
  service_apdex_time_series: serviceApdexTimeSeries,
  custom_traces_timeseries: customTracesTimeseries,
  custom_traces_breakdown: customTracesBreakdown,
  service_dependencies: serviceDependencies,
  metric_attribute_keys: metricAttributeKeys,
  span_attribute_keys: spanAttributeKeys,
  span_attribute_values: spanAttributeValues,
  resource_attribute_keys: resourceAttributeKeys,
  resource_attribute_values: resourceAttributeValues,
} as const

interface TinybirdPipeQuery<TParams extends Record<string, unknown>, TRow> {
  readonly query: (
    params: TParams & { org_id: OrgId },
  ) => Promise<{ data: ReadonlyArray<TRow> }>
}

interface TinybirdClient {
  readonly custom_traces_timeseries: TinybirdPipeQuery<
    Omit<CustomTracesTimeseriesParams, "org_id">,
    CustomTracesTimeseriesOutput
  >
  readonly custom_traces_breakdown: TinybirdPipeQuery<
    Omit<CustomTracesBreakdownParams, "org_id">,
    CustomTracesBreakdownOutput
  >
}

const createClient = (baseUrl: string, token: string): TinybirdClient =>
  new Tinybird({
    baseUrl,
    token,
    datasources: {},
    pipes,
  }) as unknown as TinybirdClient

let tinybirdClientFactory: typeof createClient = createClient

export class TinybirdService extends ServiceMap.Service<TinybirdService, TinybirdServiceShape>()("TinybirdService", {
  make: Effect.gen(function* () {
    const env = yield* Env
    const orgTinybirdSettings = yield* OrgTinybirdSettingsService

    const toTinybirdQueryError = (pipe: TinybirdQueryRequest["pipe"], error: unknown) =>
      new TinybirdQueryError({
        message: error instanceof Error ? error.message : "Tinybird query failed",
        pipe,
      })

    const getCachedOrCreateClient = (orgId: string, host: string, token: string) => {
      const now = Date.now()
      const cached = clientCache.get(orgId)
      if (cached && cached.host === host && cached.token === token && cached.expiresAt > now) {
        return cached.client
      }
      const client = tinybirdClientFactory(host, token)
      clientCache.set(orgId, { client, host, token, expiresAt: now + CLIENT_CACHE_TTL_MS })
      return client
    }

      const resolveClient = Effect.fn("TinybirdService.resolveClient")(function* (
        tenant: TenantContext,
        pipe: TinybirdQueryRequest["pipe"],
      ) {
      yield* Effect.annotateCurrentSpan("pipe", pipe)
      yield* Effect.annotateCurrentSpan("orgId", tenant.orgId)

      const override = yield* orgTinybirdSettings
        .resolveRuntimeConfig(tenant.orgId)
        .pipe(Effect.mapError((error) => toTinybirdQueryError(pipe, error)))

      if (Option.isSome(override)) {
        yield* Effect.annotateCurrentSpan("clientSource", "org_override")
        return getCachedOrCreateClient(tenant.orgId, override.value.host, override.value.token)
      }

      yield* Effect.annotateCurrentSpan("clientSource", "managed")
      return getCachedOrCreateClient("__managed__", env.TINYBIRD_HOST, Redacted.value(env.TINYBIRD_TOKEN))
    })

    const runPipe = Effect.fn("TinybirdService.runPipe")(function* <
      TPipe extends TinybirdQueryRequest["pipe"],
      TParams extends Record<string, unknown>,
      TRow,
    >(
      pipe: TPipe,
      tenant: TenantContext,
      params: TParams,
      execute: (
        params: TParams & { org_id: OrgId },
      ) => PromiseLike<{ data: ReadonlyArray<TRow> }>,
    ) {
      yield* Effect.annotateCurrentSpan("pipe", pipe)
      yield* Effect.annotateCurrentSpan("orgId", tenant.orgId)

      if (!tenant.orgId || tenant.orgId.trim() === "") {
        return yield* new TinybirdQueryError({ pipe, message: "org_id must not be empty" })
      }
      const result = yield* Effect.tryPromise({
        try: async (_signal) =>
          execute({
            ...params,
            org_id: tenant.orgId,
          }),
        catch: (error) => toTinybirdQueryError(pipe, error),
      }).pipe(
        Effect.tapError((error) =>
          Effect.logError("TinybirdService.runPipe failed", { pipe, error: String(error) })
        )
      )

      yield* Effect.annotateCurrentSpan("result.rowCount", result.data.length)
      return result.data as ReadonlyArray<TRow>
    })

    const query = Effect.fn("TinybirdService.query")(function* (
      tenant: TenantContext,
      payload: TinybirdQueryRequest,
    ) {
      yield* Effect.annotateCurrentSpan("pipe", payload.pipe)
      yield* Effect.annotateCurrentSpan("orgId", tenant.orgId)

      if (!tenant.orgId || tenant.orgId.trim() === "") {
        return yield* new TinybirdQueryError({ pipe: payload.pipe, message: "org_id must not be empty" })
      }
      const client = yield* resolveClient(tenant, payload.pipe)
      const pipeAccessor = (
        client as unknown as Record<
          string,
          {
            readonly query: (
              params?: Record<string, unknown>,
            ) => Promise<{ data?: ReadonlyArray<unknown> }>
          }
        >
      )[payload.pipe]
      const queryFunction = pipeAccessor?.query

      if (!queryFunction) {
        return yield* new TinybirdQueryError({
          message: `Unsupported Tinybird pipe: ${payload.pipe}`,
          pipe: payload.pipe,
        })
      }

      const result = yield* Effect.tryPromise({
        try: async (_signal) =>
          queryFunction({
            ...(payload.params ?? {}),
            org_id: tenant.orgId,
          }),
        catch: (error) => toTinybirdQueryError(payload.pipe, error),
      }).pipe(
        Effect.tapError((error) =>
          Effect.logError("TinybirdService.query failed", { pipe: payload.pipe, error: String(error) })
        )
      )

      yield* Effect.annotateCurrentSpan("result.rowCount", result.data?.length ?? 0)

      return new TinybirdQueryResponse({
        data: Array.from(result.data ?? []),
      })
    })

    const truncateSql = (s: string, maxLen = 1000) =>
      s.length > maxLen ? s.slice(0, maxLen) + "...[truncated]" : s

    const sqlQuery = Effect.fn("TinybirdService.sqlQuery")(function* (
      tenant: TenantContext,
      sql: string,
    ) {
      yield* Effect.annotateCurrentSpan("db.system", "clickhouse")
      yield* Effect.annotateCurrentSpan("orgId", tenant.orgId)
      yield* Effect.annotateCurrentSpan("db.statement", truncateSql(sql))

      if (!tenant.orgId || tenant.orgId.trim() === "") {
        return yield* new TinybirdQueryError({ pipe: "custom_traces_timeseries", message: "org_id must not be empty" })
      }
      if (!sql.includes("OrgId")) {
        return yield* new TinybirdQueryError({ pipe: "custom_traces_timeseries", message: "SQL query must contain OrgId filter" })
      }
      // Use "custom_traces_timeseries" as the pipe identifier for client resolution / error context
      const client = yield* resolveClient(tenant, "custom_traces_timeseries")
      const result = yield* Effect.tryPromise({
        try: () => (client as unknown as { sql: (sql: string) => Promise<{ data: ReadonlyArray<Record<string, unknown>> }> }).sql(sql),
        catch: (error) => toTinybirdQueryError("custom_traces_timeseries", error),
      }).pipe(
        Effect.tapError((error) =>
          Effect.logError("TinybirdService.sqlQuery failed", { error: String(error) })
        ),
      )

      yield* Effect.annotateCurrentSpan("result.rowCount", result.data.length)
      return result.data
    })

    return {
      query,
      sqlQuery,
    } satisfies TinybirdServiceShape
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
  static readonly Live = this.layer
  static readonly Default = this.layer

  static readonly query = (
    tenant: TenantContext,
    payload: TinybirdQueryRequest,
  ) => this.use((service) => service.query(tenant, payload))
}

export const __testables = {
  setClientFactory: (factory: typeof createClient) => {
    tinybirdClientFactory = factory
    clientCache.clear()
  },
  reset: () => {
    tinybirdClientFactory = createClient
    clientCache.clear()
  },
}
