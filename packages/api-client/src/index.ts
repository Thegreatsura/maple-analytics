import type {
  QueryEngineExecuteRequest,
  QueryEngineExecuteResponse,
  TinybirdPipe,
} from "@maple/domain"
import type {
  ApiKeyCreatedResponse,
  ApiKeyResponse,
  ApiKeysListResponse,
  CurrentTenant,
  DashboardDeleteResponse,
  DashboardDocument,
  DashboardsListResponse,
  IngestKeysResponse,
  ScrapeTargetDeleteResponse,
  ScrapeTargetResponse,
  ScrapeTargetsListResponse,
  SelfHostedLoginResponse,
} from "@maple/domain/http"
import * as Atom from "@effect-atom/atom/Atom"
import * as AtomHttpApi from "@effect-atom/atom/AtomHttpApi"
import * as Registry from "@effect-atom/atom/Registry"
import * as FetchHttpClient from "@effect/platform/FetchHttpClient"
import * as HttpClient from "@effect/platform/HttpClient"
import { MapleApi } from "@maple/domain/http"
import { Effect, Layer } from "effect"

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface MapleApiClientConfig {
  readonly baseUrl: string
  readonly fetch?: FetchLike
  readonly getHeaders?: () => HeadersInit
}

export interface TinybirdQueryInput {
  readonly pipe: TinybirdPipe
  readonly params?: Record<string, unknown>
}

export interface TinybirdQueryResult {
  readonly data: unknown[]
}

export interface QueryEngineExecuteResult extends QueryEngineExecuteResponse {}
export interface DashboardUpsertInput {
  readonly dashboardId: string
  readonly dashboard: DashboardDocument
}

export interface DashboardDeleteInput {
  readonly dashboardId: string
}

export interface SelfHostedLoginInput {
  readonly password: string
}

export interface CreateScrapeTargetInput {
  readonly name: string
  readonly url: string
  readonly scrapeIntervalSeconds?: number
  readonly labelsJson?: string | null
  readonly authType?: string
  readonly serviceName?: string | null
  readonly authCredentials?: string | null
  readonly enabled?: boolean
}

export interface UpdateScrapeTargetInput {
  readonly targetId: string
  readonly name?: string
  readonly url?: string
  readonly scrapeIntervalSeconds?: number
  readonly labelsJson?: string | null
  readonly authType?: string
  readonly serviceName?: string | null
  readonly authCredentials?: string | null
  readonly enabled?: boolean
}

export interface DeleteScrapeTargetInput {
  readonly targetId: string
}

export interface CreateApiKeyInput {
  readonly name: string
  readonly description?: string
  readonly expiresInSeconds?: number
}

export interface RevokeApiKeyInput {
  readonly keyId: string
}

const runAtomMutation = <Arg, A, E>(
  registry: Registry.Registry,
  atom: Atom.AtomResultFn<Arg, A, E>,
  arg: Arg,
) => {
  registry.set(atom, arg)
  return Effect.runPromise(Registry.getResult(registry, atom, { suspendOnWaiting: true }))
}

export function createMapleApiClient(config: MapleApiClientConfig) {
  const fetchImpl: FetchLike = config.fetch ?? globalThis.fetch

  const mapleFetch: FetchLike = (input, init) => {
    const headers = new Headers(init?.headers)

    for (const [name, value] of Object.entries(config.getHeaders?.() ?? {})) {
      headers.set(name, String(value))
    }

    return fetchImpl(input, {
      ...init,
      headers,
    })
  }

  const MapleFetchHttpClientLive = FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, mapleFetch as typeof globalThis.fetch)),
  )

  class MapleApiAtomClient extends AtomHttpApi.Tag<MapleApiAtomClient>()("MapleApiAtomClient", {
    api: MapleApi,
    // AtomHttpApi.Tag expects a Layer providing middleware context types,
    // but MapleFetchHttpClientLive only provides HttpClient — @effect-atom library limitation
    httpClient: MapleFetchHttpClientLive as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    baseUrl: config.baseUrl,
    transformClient: (client) =>
      client.pipe(
        HttpClient.retry({
          times: 3,
          while: (error) => {
            if (error._tag === "ResponseError") {
              const status = error.response.status
              return status >= 500 && status < 600
            }

            return error._tag === "RequestError"
          },
        }),
      ),
  }) {}

  const registry = Registry.make()
  const tinybirdQueryMutation = MapleApiAtomClient.mutation("tinybird", "query")
  const queryEngineExecuteMutation = MapleApiAtomClient.mutation("queryEngine", "execute")

  const requestJson = async <T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> => {
    const response = await mapleFetch(`${config.baseUrl}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as { message?: string } | null
      const fallback = `${method} ${path} failed with status ${response.status}`
      throw new Error(errorBody?.message ?? fallback)
    }

    return (await response.json()) as T
  }

  const queryTinybird = ({ pipe, params }: TinybirdQueryInput): Promise<TinybirdQueryResult> => {
    return runAtomMutation(registry, tinybirdQueryMutation, {
      payload: {
        pipe,
        params,
      },
    }) as Promise<TinybirdQueryResult>
  }

  const executeQueryEngine = (payload: QueryEngineExecuteRequest): Promise<QueryEngineExecuteResult> => {
    return runAtomMutation(registry, queryEngineExecuteMutation, { payload }) as Promise<QueryEngineExecuteResult>
  }

  const listDashboards = (): Promise<DashboardsListResponse> => {
    return requestJson<DashboardsListResponse>("GET", "/api/dashboards")
  }

  const upsertDashboard = ({ dashboardId, dashboard }: DashboardUpsertInput): Promise<DashboardDocument> => {
    return requestJson<DashboardDocument>("PUT", `/api/dashboards/${encodeURIComponent(dashboardId)}`, {
      dashboard,
    })
  }

  const deleteDashboard = ({ dashboardId }: DashboardDeleteInput): Promise<DashboardDeleteResponse> => {
    return requestJson<DashboardDeleteResponse>("DELETE", `/api/dashboards/${encodeURIComponent(dashboardId)}`)
  }

  const getIngestKeys = (): Promise<IngestKeysResponse> => {
    return requestJson<IngestKeysResponse>("GET", "/api/ingest-keys")
  }

  const rerollPublicIngestKey = (): Promise<IngestKeysResponse> => {
    return requestJson<IngestKeysResponse>("POST", "/api/ingest-keys/public/reroll")
  }

  const rerollPrivateIngestKey = (): Promise<IngestKeysResponse> => {
    return requestJson<IngestKeysResponse>("POST", "/api/ingest-keys/private/reroll")
  }

  const loginSelfHosted = ({ password }: SelfHostedLoginInput): Promise<SelfHostedLoginResponse> => {
    return requestJson<SelfHostedLoginResponse>("POST", "/api/auth/login", {
      password,
    })
  }

  const getCurrentSession = (): Promise<CurrentTenant.TenantSchema> => {
    return requestJson<CurrentTenant.TenantSchema>("GET", "/api/auth/session")
  }

  const listScrapeTargets = (): Promise<ScrapeTargetsListResponse> => {
    return requestJson<ScrapeTargetsListResponse>("GET", "/api/scrape-targets")
  }

  const createScrapeTarget = (input: CreateScrapeTargetInput): Promise<ScrapeTargetResponse> => {
    return requestJson<ScrapeTargetResponse>("POST", "/api/scrape-targets", input)
  }

  const updateScrapeTarget = ({ targetId, ...body }: UpdateScrapeTargetInput): Promise<ScrapeTargetResponse> => {
    return requestJson<ScrapeTargetResponse>("PATCH", `/api/scrape-targets/${encodeURIComponent(targetId)}`, body)
  }

  const deleteScrapeTarget = ({ targetId }: DeleteScrapeTargetInput): Promise<ScrapeTargetDeleteResponse> => {
    return requestJson<ScrapeTargetDeleteResponse>("DELETE", `/api/scrape-targets/${encodeURIComponent(targetId)}`)
  }

  const listApiKeys = (): Promise<ApiKeysListResponse> => {
    return requestJson<ApiKeysListResponse>("GET", "/api/api-keys")
  }

  const createApiKey = (input: CreateApiKeyInput): Promise<ApiKeyCreatedResponse> => {
    return requestJson<ApiKeyCreatedResponse>("POST", "/api/api-keys", input)
  }

  const revokeApiKey = ({ keyId }: RevokeApiKeyInput): Promise<ApiKeyResponse> => {
    return requestJson<ApiKeyResponse>("DELETE", `/api/api-keys/${encodeURIComponent(keyId)}/revoke`)
  }

  return {
    queryTinybird,
    executeQueryEngine,
    listDashboards,
    upsertDashboard,
    deleteDashboard,
    getIngestKeys,
    rerollPublicIngestKey,
    rerollPrivateIngestKey,
    loginSelfHosted,
    getCurrentSession,
    listScrapeTargets,
    createScrapeTarget,
    updateScrapeTarget,
    deleteScrapeTarget,
    listApiKeys,
    createApiKey,
    revokeApiKey,
  }
}
