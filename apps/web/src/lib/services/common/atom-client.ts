import { AtomHttpApi } from "@/lib/effect-atom"
import { MapleApi } from "@maple/domain/http"
import { HttpClient, HttpClientError } from "effect/unstable/http"
import { apiBaseUrl } from "./api-base-url"
import { MapleFetchHttpClientLive } from "./http-client"

export class MapleApiAtomClient extends AtomHttpApi.Service<MapleApiAtomClient>()(
  "MapleApiAtomClient",
  {
    api: MapleApi,
    httpClient: MapleFetchHttpClientLive,
    baseUrl: apiBaseUrl,
    transformClient: (client) =>
      client.pipe(
        HttpClient.retry({
          times: 3,
          while: (error) => {
            if (HttpClientError.isHttpClientError(error)) {
              const status = error.response?.status
              return status === undefined || (status >= 500 && status < 600)
            }

            return false
          },
        }),
      ),
  },
) {}
