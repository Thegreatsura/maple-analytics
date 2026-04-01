import { datasources, pipes, projectRevision } from "../generated/tinybird-project-manifest"
import { FetchHttpClient, HttpBody, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { Duration, Effect, Layer, Schema, ServiceMap } from "effect"

const POLL_INTERVAL_MS = 2_000
const MAX_POLL_ATTEMPTS = 300
const REQUEST_TIMEOUT = Duration.seconds(30)

const FeedbackEntry = Schema.Struct({
  resource: Schema.NullOr(Schema.String),
  level: Schema.String,
  message: Schema.String,
})

const DeployResponseSchema = Schema.Struct({
  result: Schema.Literals(["success", "failed", "no_changes"]),
  deployment: Schema.optionalKey(Schema.Struct({
    id: Schema.String,
    status: Schema.optionalKey(Schema.String),
    feedback: Schema.optionalKey(Schema.Array(FeedbackEntry)),
    deleted_datasource_names: Schema.optionalKey(Schema.Array(Schema.String)),
    deleted_pipe_names: Schema.optionalKey(Schema.Array(Schema.String)),
    changed_datasource_names: Schema.optionalKey(Schema.Array(Schema.String)),
    changed_pipe_names: Schema.optionalKey(Schema.Array(Schema.String)),
    new_datasource_names: Schema.optionalKey(Schema.Array(Schema.String)),
    new_pipe_names: Schema.optionalKey(Schema.Array(Schema.String)),
  })),
  error: Schema.optionalKey(Schema.String),
  errors: Schema.optionalKey(Schema.Array(Schema.Struct({
    filename: Schema.optionalKey(Schema.String),
    error: Schema.String,
  }))),
})
type DeployResponse = typeof DeployResponseSchema.Type
const DeployResponseFromJson = Schema.fromJsonString(DeployResponseSchema)

export interface TinybirdProjectSyncParams {
  readonly baseUrl: string
  readonly token: string
}

export interface TinybirdProjectSyncResult {
  readonly projectRevision: string
  readonly result: DeployResponse["result"]
  readonly deploymentId?: string
}

export interface TinybirdDeploymentStatus {
  readonly deploymentId: string
  readonly status: string
  readonly isTerminal: boolean
  readonly errorMessage: string | null
}

export interface TinybirdDatasourceStats {
  readonly name: string
  readonly rowCount: number
  readonly bytes: number
}

export interface TinybirdInstanceHealth {
  readonly workspaceName: string | null
  readonly datasources: ReadonlyArray<TinybirdDatasourceStats>
  readonly totalRows: number
  readonly totalBytes: number
  readonly recentErrorCount: number
  readonly avgQueryLatencyMs: number | null
}

interface SqlResponse {
  readonly data?: ReadonlyArray<Record<string, unknown>>
}

const DeploymentStatusBodySchema = Schema.Struct({
  deployment: Schema.optionalKey(Schema.Struct({
    status: Schema.optionalKey(Schema.String),
    feedback: Schema.optionalKey(Schema.Array(FeedbackEntry)),
    errors: Schema.optionalKey(Schema.Array(Schema.String)),
  })),
})
type DeploymentStatusBody = typeof DeploymentStatusBodySchema.Type
const DeploymentStatusBodyFromJson = Schema.fromJsonString(DeploymentStatusBodySchema)

interface DeploymentsListBody {
  readonly deployments: Array<{ readonly id: string; readonly status: string; readonly live?: boolean }>
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = new Set(["live", "data_ready", "failed", "error", "deleting", "deleted"])
const FAILURE_STATUSES = new Set(["failed", "error", "deleting", "deleted"])

const normalizeBaseUrl = (raw: string) => raw.trim().replace(/\/+$/, "")

const toDeployErrorMessage = (body: DeployResponse, fallback: string): string => {
  const feedbackErrors = body.deployment?.feedback
    ?.filter((entry) => entry.level === "ERROR")
    .map((entry) => entry.message)

  if (feedbackErrors && feedbackErrors.length > 0) {
    return feedbackErrors.join("\n")
  }

  if (body.error) return body.error
  if (body.errors && body.errors.length > 0) {
    return body.errors.map((entry) => entry.error).join("\n")
  }

  return fallback
}

const extractStatusErrorMessage = (body: DeploymentStatusBody, status: string): string | null => {
  if (!FAILURE_STATUSES.has(status)) return null

  const deployErrors = body.deployment?.errors
  if (deployErrors && deployErrors.length > 0) {
    return deployErrors.join("\n")
  }

  const feedbackErrors = body.deployment?.feedback
    ?.filter((entry) => entry.level === "ERROR")
    .map((entry) => entry.message)
  if (feedbackErrors && feedbackErrors.length > 0) {
    return feedbackErrors.join("\n")
  }

  return null
}

type FeedbackEntry = { readonly resource: string | null; readonly level: string; readonly message: string }

const formatFeedback = (feedback: ReadonlyArray<FeedbackEntry>): string | null => {
  if (feedback.length === 0) return null
  return feedback
    .map((entry) => `[${entry.level}]${entry.resource ? ` ${entry.resource}:` : ""} ${entry.message}`)
    .join("\n")
}

class TinybirdSyncError extends Error {
  readonly statusCode: number | null
  constructor(message: string, statusCode: number | null = null) {
    super(message)
    this.name = "TinybirdSyncError"
    this.statusCode = statusCode
  }
}

const catchHttpErrors = <A>(effect: Effect.Effect<A, TinybirdSyncError | { readonly _tag: string; readonly message?: string }, never>): Effect.Effect<A, TinybirdSyncError, never> =>
  effect.pipe(
    Effect.catchIf(
      (error): error is { readonly _tag: string; readonly message?: string } => !(error instanceof TinybirdSyncError),
      (error) => Effect.fail(new TinybirdSyncError(error.message ?? `Tinybird request failed (${error._tag})`)),
    ),
  ) as Effect.Effect<A, TinybirdSyncError, never>


// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface TinybirdProjectSyncShape {
  readonly syncProject: (params: TinybirdProjectSyncParams) => Effect.Effect<TinybirdProjectSyncResult, TinybirdSyncError>
  readonly getDeploymentStatus: (params: TinybirdProjectSyncParams & { readonly deploymentId: string }) => Effect.Effect<TinybirdDeploymentStatus, TinybirdSyncError>
  readonly fetchInstanceHealth: (params: TinybirdProjectSyncParams) => Effect.Effect<TinybirdInstanceHealth, TinybirdSyncError>
  readonly getCurrentProjectRevision: () => Effect.Effect<string>
}

export class TinybirdProjectSync extends ServiceMap.Service<TinybirdProjectSync, TinybirdProjectSyncShape>()(
  "TinybirdProjectSync",
  {
    make: Effect.gen(function* () {
      const httpClient = yield* HttpClient.HttpClient

      const makeAuthClient = (params: TinybirdProjectSyncParams) => {
        const baseUrl = normalizeBaseUrl(params.baseUrl)
        const client = httpClient.pipe(
          HttpClient.mapRequest(
            HttpClientRequest.setHeaders({ Authorization: `Bearer ${params.token}` }),
          ),
        )
        return { baseUrl, client }
      }

      // ------ cleanup stale deployments ------

      const cleanupStaleDeployments = Effect.fn("TinybirdProjectSync.cleanupStaleDeployments")(
        function* (params: TinybirdProjectSyncParams) {
          const { baseUrl, client } = makeAuthClient(params)

          const response = yield* client
            .get(`${baseUrl}/v1/deployments`)
            .pipe(Effect.scoped, Effect.timeout(REQUEST_TIMEOUT))

          if (response.status >= 400) return

          const body = yield* response.json.pipe(
            Effect.map((json) => json as unknown as DeploymentsListBody),
          )

          for (const d of body.deployments) {
            if (!d.live && d.status !== "live") {
              yield* client
                .del(`${baseUrl}/v1/deployments/${d.id}`)
                .pipe(Effect.scoped, Effect.timeout(REQUEST_TIMEOUT), Effect.ignore)
            }
          }
        },
      )

      // ------ sync project ------

      const syncProject = Effect.fn("TinybirdProjectSync.syncProject")(
        function* (params: TinybirdProjectSyncParams) {
          const { baseUrl, client } = makeAuthClient(params)

          // Step 0: Clean up stale deployments that may block the new one
          yield* cleanupStaleDeployments(params).pipe(Effect.ignore)

          // Step 1: Build FormData
          const formData = new FormData()
          for (const datasource of datasources) {
            formData.append(
              "data_project://",
              new Blob([datasource.content], { type: "text/plain" }),
              `${datasource.name}.datasource`,
            )
          }
          for (const pipe of pipes) {
            formData.append(
              "data_project://",
              new Blob([pipe.content], { type: "text/plain" }),
              `${pipe.name}.pipe`,
            )
          }

          // Step 2: POST /v1/deploy
          const deployUrl = `${baseUrl}/v1/deploy?${new URLSearchParams({ allow_destructive_operations: "true" })}`
          const deployResponse = yield* client
            .post(deployUrl, { body: HttpBody.formData(formData) })
            .pipe(Effect.scoped, Effect.timeout(REQUEST_TIMEOUT))

          const deployRawBody = yield* deployResponse.text.pipe(Effect.orElseSucceed(() => ""))

          if (deployResponse.status >= 400) {
            return yield* Effect.fail(
              new TinybirdSyncError(
                `Tinybird project sync failed (HTTP ${deployResponse.status}).\nResponse: ${deployRawBody}`,
                deployResponse.status,
              ),
            )
          }

          const deployBody = yield* Schema.decodeUnknownEffect(DeployResponseFromJson)(deployRawBody).pipe(
            Effect.mapError(() =>
              new TinybirdSyncError(
                `Tinybird returned invalid JSON from /v1/deploy.\nResponse: ${deployRawBody}`,
                deployResponse.status,
              ),
            ),
          )

          if (deployBody.result === "failed") {
            return yield* Effect.fail(
              new TinybirdSyncError(
                toDeployErrorMessage(deployBody, `Tinybird project sync failed.\nResponse: ${deployRawBody}`),
                deployResponse.status,
              ),
            )
          }

          const initialFeedback = deployBody.deployment?.feedback ?? []

          if (deployBody.result === "no_changes") {
            return {
              projectRevision,
              result: "no_changes" as const,
              deploymentId: deployBody.deployment?.id,
            }
          }

          const deploymentId = deployBody.deployment?.id
          if (!deploymentId) {
            return yield* Effect.fail(new TinybirdSyncError("Tinybird project sync did not return a deployment id"))
          }

          // Step 3: Poll until data_ready
          for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
            yield* Effect.sleep(Duration.millis(POLL_INTERVAL_MS))

            const statusResponse = yield* client
              .get(`${baseUrl}/v1/deployments/${deploymentId}`)
              .pipe(Effect.scoped, Effect.timeout(REQUEST_TIMEOUT))

            const statusRawBody = yield* statusResponse.text.pipe(Effect.orElseSucceed(() => ""))

            if (statusResponse.status === 404) {
              const context = formatFeedback(initialFeedback)
              return yield* Effect.fail(
                new TinybirdSyncError(
                  context
                    ? `Tinybird deployment was deleted before reaching data_ready.\n${context}`
                    : `Tinybird deployment ${deploymentId} was deleted before reaching data_ready.\nResponse: ${statusRawBody}`,
                  404,
                ),
              )
            }
            if (statusResponse.status >= 400) {
              return yield* Effect.fail(
                new TinybirdSyncError(
                  `Tinybird deployment status check failed (HTTP ${statusResponse.status}).\nResponse: ${statusRawBody}`,
                  statusResponse.status,
                ),
              )
            }

            const statusBody = yield* Schema.decodeUnknownEffect(DeploymentStatusBodyFromJson)(statusRawBody).pipe(
              Effect.mapError(() =>
                new TinybirdSyncError(
                  `Tinybird returned invalid JSON from deployment status.\nResponse: ${statusRawBody}`,
                  statusResponse.status,
                ),
              ),
            )
            const status = statusBody.deployment?.status

            if (status === "data_ready") {
              break
            }
            if (status && FAILURE_STATUSES.has(status)) {
              const structuredDetail = extractStatusErrorMessage(statusBody, status)
                ?? formatFeedback(initialFeedback)
              const message = structuredDetail
                ? `Tinybird deployment ${status}: ${structuredDetail}`
                : `Tinybird deployment ${status} before reaching data_ready.\nResponse: ${statusRawBody}`
              return yield* Effect.fail(new TinybirdSyncError(message, statusResponse.status))
            }
            if (attempt === MAX_POLL_ATTEMPTS - 1) {
              return yield* Effect.fail(new TinybirdSyncError("Tinybird deployment timed out before reaching data_ready"))
            }
          }

          // Step 4: Set live
          const liveResponse = yield* client
            .post(`${baseUrl}/v1/deployments/${deploymentId}/set-live`)
            .pipe(Effect.scoped, Effect.timeout(REQUEST_TIMEOUT))

          if (liveResponse.status >= 400) {
            const liveRawBody = yield* liveResponse.text.pipe(Effect.orElseSucceed(() => ""))
            return yield* Effect.fail(
              new TinybirdSyncError(
                `Failed to set Tinybird deployment ${deploymentId} live (HTTP ${liveResponse.status}).\nResponse: ${liveRawBody}`,
                liveResponse.status,
              ),
            )
          }

          return {
            projectRevision,
            result: deployBody.result,
            deploymentId,
          }
        },
      )

      // ------ get deployment status ------

      const getDeploymentStatus = Effect.fn("TinybirdProjectSync.getDeploymentStatus")(
        function* (params: TinybirdProjectSyncParams & { readonly deploymentId: string }) {
          const { baseUrl, client } = makeAuthClient(params)

          const response = yield* client
            .get(`${baseUrl}/v1/deployments/${params.deploymentId}`)
            .pipe(Effect.scoped, Effect.timeout(REQUEST_TIMEOUT))

          const rawBody = yield* response.text.pipe(Effect.orElseSucceed(() => ""))

          if (response.status === 404) {
            return {
              deploymentId: params.deploymentId,
              status: "deleted",
              isTerminal: true,
              errorMessage: `Deployment ${params.deploymentId} was deleted.\nResponse: ${rawBody}`,
            }
          }
          if (response.status >= 400) {
            return yield* Effect.fail(
              new TinybirdSyncError(
                `Deployment status check failed (HTTP ${response.status}).\nResponse: ${rawBody}`,
                response.status,
              ),
            )
          }

          const body = yield* Schema.decodeUnknownEffect(DeploymentStatusBodyFromJson)(rawBody).pipe(
            Effect.mapError(() =>
              new TinybirdSyncError(
                `Tinybird returned invalid JSON from deployment status.\nResponse: ${rawBody}`,
                response.status,
              ),
            ),
          )
          const status = body.deployment?.status ?? "unknown"
          const errorMessage = extractStatusErrorMessage(body, status)

          return {
            deploymentId: params.deploymentId,
            status,
            isTerminal: TERMINAL_STATUSES.has(status),
            errorMessage,
          }
        },
      )

      // ------ fetch instance health ------

      const fetchInstanceHealth = Effect.fn("TinybirdProjectSync.fetchInstanceHealth")(
        function* (params: TinybirdProjectSyncParams) {
          const { baseUrl, client } = makeAuthClient(params)

          const querySql = (sql: string) =>
            client
              .get(`${baseUrl}/v0/sql?q=${encodeURIComponent(`${sql} FORMAT JSON`)}`)
              .pipe(
                Effect.scoped,
                Effect.timeout(REQUEST_TIMEOUT),
                Effect.flatMap((res) =>
                  res.status >= 400
                    ? Effect.succeed(null)
                    : res.json.pipe(Effect.map((json) => json as unknown as SqlResponse)),
                ),
                Effect.orElseSucceed(() => null as SqlResponse | null),
              )

          const [workspace, datasourcesResult, errorsResult, latencyResult] = yield* Effect.all(
            [
              client
                .get(`${baseUrl}/v1/workspace`)
                .pipe(
                  Effect.scoped,
                  Effect.timeout(REQUEST_TIMEOUT),
                  Effect.flatMap((res) =>
                    res.status >= 400
                      ? Effect.succeed(null)
                      : res.json.pipe(Effect.map((json) => json as unknown as { name?: string })),
                  ),
                  Effect.orElseSucceed(() => null as { name?: string } | null),
                ),
              querySql(
                "SELECT datasource_name, bytes, rows FROM tinybird.datasources_storage WHERE timestamp = (SELECT max(timestamp) FROM tinybird.datasources_storage) ORDER BY bytes DESC",
              ),
              querySql(
                "SELECT count() as cnt FROM tinybird.endpoint_errors WHERE start_datetime >= now() - interval 1 day",
              ),
              querySql(
                "SELECT avg(duration) as avg_ms FROM tinybird.pipe_stats_rt WHERE start_datetime >= now() - interval 1 day",
              ),
            ],
            { concurrency: "unbounded" },
          )

          const ds = (datasourcesResult?.data ?? []).map((row) => ({
            name: String(row.datasource_name ?? ""),
            rowCount: Number(row.rows ?? 0),
            bytes: Number(row.bytes ?? 0),
          }))

          const totalRows = ds.reduce((sum, d) => sum + d.rowCount, 0)
          const totalBytes = ds.reduce((sum, d) => sum + d.bytes, 0)

          const recentErrorCount = Number(errorsResult?.data?.[0]?.cnt ?? 0)
          const avgLatencyRaw = latencyResult?.data?.[0]?.avg_ms
          const avgQueryLatencyMs = typeof avgLatencyRaw === "number" ? avgLatencyRaw * 1000 : null

          return {
            workspaceName: workspace?.name ?? null,
            datasources: ds,
            totalRows,
            totalBytes,
            recentErrorCount,
            avgQueryLatencyMs,
          }
        },
      )

      // ------ project revision ------

      const getCurrentProjectRevision = Effect.fn("TinybirdProjectSync.getCurrentProjectRevision")(
        function* () {
          return projectRevision
        },
      )

      return {
        syncProject: (params: TinybirdProjectSyncParams) => catchHttpErrors(syncProject(params)),
        getDeploymentStatus: (params: TinybirdProjectSyncParams & { readonly deploymentId: string }) => catchHttpErrors(getDeploymentStatus(params)),
        fetchInstanceHealth: (params: TinybirdProjectSyncParams) => catchHttpErrors(fetchInstanceHealth(params)),
        getCurrentProjectRevision,
      }
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(FetchHttpClient.layer),
  )
  static readonly Live = this.layer

  static readonly syncProject = (params: TinybirdProjectSyncParams) =>
    this.use((service) => service.syncProject(params))

  static readonly getDeploymentStatus = (params: TinybirdProjectSyncParams & { readonly deploymentId: string }) =>
    this.use((service) => service.getDeploymentStatus(params))

  static readonly fetchInstanceHealth = (params: TinybirdProjectSyncParams) =>
    this.use((service) => service.fetchInstanceHealth(params))

  static readonly getCurrentProjectRevision = () =>
    this.use((service) => service.getCurrentProjectRevision())
}

// ---------------------------------------------------------------------------
// Legacy async wrappers (for existing tests using __testables)
// ---------------------------------------------------------------------------

export const syncTinybirdProject = async (
  params: TinybirdProjectSyncParams,
): Promise<TinybirdProjectSyncResult> =>
  Effect.runPromise(TinybirdProjectSync.syncProject(params).pipe(Effect.provide(TinybirdProjectSync.layer)))

export const getDeploymentStatus = async (
  params: TinybirdProjectSyncParams & { readonly deploymentId: string },
): Promise<TinybirdDeploymentStatus> =>
  Effect.runPromise(TinybirdProjectSync.getDeploymentStatus(params).pipe(Effect.provide(TinybirdProjectSync.layer)))

export const fetchInstanceHealth = async (
  params: TinybirdProjectSyncParams,
): Promise<TinybirdInstanceHealth> =>
  Effect.runPromise(TinybirdProjectSync.fetchInstanceHealth(params).pipe(Effect.provide(TinybirdProjectSync.layer)))

export const getCurrentTinybirdProjectRevision = async (): Promise<string> =>
  Effect.runPromise(TinybirdProjectSync.getCurrentProjectRevision().pipe(Effect.provide(TinybirdProjectSync.layer)))
