import { FetchHttpClient } from "effect/unstable/http"
import { Layer } from "effect"
import { getMapleAuthHeaders } from "./auth-headers"

const mapleFetch: typeof globalThis.fetch = async (input, init) => {
  const headers = new Headers(init?.headers)
  const authHeaders = await getMapleAuthHeaders()

  for (const [name, value] of Object.entries(authHeaders)) {
    headers.set(name, value)
  }

  return globalThis.fetch(input, {
    ...init,
    headers,
  })
}

export const MapleFetchHttpClientLive = FetchHttpClient.layer.pipe(
  Layer.provideMerge(Layer.succeed(FetchHttpClient.Fetch, mapleFetch)),
)
