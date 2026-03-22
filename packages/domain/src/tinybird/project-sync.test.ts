import { afterEach, describe, expect, it, mock } from "bun:test"
import { datasources, pipes, projectRevision } from "../generated/tinybird-project-manifest"
import { getCurrentTinybirdProjectRevision, syncTinybirdProject } from "./project-sync"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("Tinybird project sync", () => {
  it("returns the bundled project revision", async () => {
    expect(await getCurrentTinybirdProjectRevision()).toBe(projectRevision)
  })

  it("uploads the bundled Tinybird resources without building from disk at runtime", async () => {
    let requestBody: FormData | null = null
    let authorizationHeader = ""

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const isRequest = input instanceof Request
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const method = init?.method ?? (isRequest ? input.method : "GET")
      const headers = init?.headers instanceof Headers
        ? init.headers
        : isRequest
          ? input.headers
          : new Headers(init?.headers as HeadersInit | undefined)
      authorizationHeader = headers.get("Authorization") ?? ""

      // Stale deployment cleanup call
      if (url.includes("/v1/deployments") && method === "GET") {
        return new Response(JSON.stringify({ deployments: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }

      requestBody = (init?.body ?? (isRequest ? input.body : null)) as FormData

      return new Response(
        JSON.stringify({
          result: "no_changes",
          deployment: { id: "dep-1" },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )
    }) as unknown as typeof fetch

    const result = await syncTinybirdProject({
      baseUrl: "https://customer.tinybird.co/",
      token: "customer-token",
    })

    expect(result).toEqual({
      projectRevision,
      result: "no_changes",
      deploymentId: "dep-1",
    })
    expect(authorizationHeader).toBe("Bearer customer-token")
    expect(requestBody).toBeInstanceOf(FormData)
    if (requestBody == null) {
      throw new Error("Expected Tinybird sync to upload a multipart body")
    }

    const uploadedBody = requestBody as FormData
    const uploadedFiles = uploadedBody.getAll("data_project://") as File[]
    const uploadedNames = uploadedFiles.map((file) => file.name).sort()
    const expectedNames = [
      ...datasources.map((resource) => `${resource.name}.datasource`),
      ...pipes.map((resource) => `${resource.name}.pipe`),
    ].sort()

    expect(uploadedNames).toEqual(expectedNames)
  })
})
