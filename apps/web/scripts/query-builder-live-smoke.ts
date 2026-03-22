import type { QuerySpec } from "@maple/query-engine"
import {
  buildFormulaResults,
  type QueryRunResult,
  type TimeseriesPoint,
} from "../src/components/query-builder/formula-results"
import {
  __testables as queryBuilderTestables,
} from "../src/api/tinybird/query-builder-timeseries"
import {
  buildTimeseriesQuerySpec,
  createQueryDraft,
  type QueryBuilderQueryDraft,
} from "../src/lib/query-builder/model"
import { relativeToAbsolute } from "../src/lib/time-utils"
import { createMapleApiClient } from "../../../packages/api-client/src/index"

type SmokeOptions = {
  apiBaseUrl: string
  orgId?: string
  userId?: string
  apiKey?: string
  bearerToken?: string
  startTime?: string
  endTime?: string
  preset: string
  service?: string
  discover: boolean
  discoverChunks: number
  strict: boolean
}

type AttemptLog = {
  startTime: string
  endTime: string
  bucketSeconds?: number
}

function parseArgs(argv: string[]): SmokeOptions {
  const result: SmokeOptions = {
    apiBaseUrl: process.env.MAPLE_API_BASE_URL ?? "http://127.0.0.1:3472",
    orgId: process.env.MAPLE_ORG_ID,
    userId: process.env.MAPLE_USER_ID,
    apiKey: process.env.MAPLE_API_KEY,
    bearerToken: process.env.MAPLE_BEARER_TOKEN,
    startTime: process.env.MAPLE_START_TIME,
    endTime: process.env.MAPLE_END_TIME,
    preset: process.env.MAPLE_TIME_PRESET ?? "1h",
    service: process.env.MAPLE_SERVICE_NAME,
    discover: process.env.MAPLE_DISCOVER_RANGE === "1",
    discoverChunks: Number.parseInt(process.env.MAPLE_DISCOVER_CHUNKS ?? "12", 10),
    strict: process.env.MAPLE_STRICT !== "0",
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const next = argv[index + 1]

    if (token === "--help" || token === "-h") {
      printHelp()
      process.exit(0)
    }
    if (token === "--api-base-url" && next) {
      result.apiBaseUrl = next
      index += 1
      continue
    }
    if (token === "--org-id" && next) {
      result.orgId = next
      index += 1
      continue
    }
    if (token === "--user-id" && next) {
      result.userId = next
      index += 1
      continue
    }
    if (token === "--api-key" && next) {
      result.apiKey = next
      index += 1
      continue
    }
    if (token === "--bearer-token" && next) {
      result.bearerToken = next
      index += 1
      continue
    }
    if (token === "--start-time" && next) {
      result.startTime = next
      index += 1
      continue
    }
    if (token === "--end-time" && next) {
      result.endTime = next
      index += 1
      continue
    }
    if (token === "--preset" && next) {
      result.preset = next
      index += 1
      continue
    }
    if (token === "--service" && next) {
      result.service = next
      index += 1
      continue
    }
    if (token === "--discover") {
      result.discover = true
      continue
    }
    if (token === "--discover-chunks" && next) {
      const parsed = Number.parseInt(next, 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        result.discoverChunks = parsed
      }
      index += 1
      continue
    }
    if (token === "--strict") {
      result.strict = true
      continue
    }
    if (token === "--no-strict") {
      result.strict = false
      continue
    }
  }

  return result
}

function printHelp(): void {
  console.log(
    [
      "Query Builder Live Smoke Runner",
      "",
      "Usage:",
      "  bun run apps/web/scripts/query-builder-live-smoke.ts [options]",
      "",
      "Options:",
      "  --api-base-url <url>    API base URL (default: http://127.0.0.1:3472)",
      "  --org-id <id>           x-maple-org-id header",
      "  --user-id <id>          x-maple-user-id header",
      "  --api-key <key>         x-api-key header",
      "  --bearer-token <token>  Authorization: Bearer <token>",
      "  --start-time <time>     Tinybird datetime, e.g. 2026-02-11 00:00:00",
      "  --end-time <time>       Tinybird datetime, e.g. 2026-02-11 01:00:00",
      "  --preset <value>        Relative range if start/end not set (default: 1h)",
      "  --service <name>        Filter default queries to a specific service",
      "  --discover              Search backward for a recent window with trace data",
      "  --discover-chunks <n>   Number of 31d chunks to scan when discovering (default: 12)",
      "  --strict                Exit non-zero when no base query series data",
      "  --no-strict             Always exit zero",
      "",
      "Environment equivalents:",
      "  MAPLE_API_BASE_URL, MAPLE_ORG_ID, MAPLE_USER_ID, MAPLE_API_KEY,",
      "  MAPLE_BEARER_TOKEN, MAPLE_START_TIME, MAPLE_END_TIME,",
      "  MAPLE_TIME_PRESET, MAPLE_SERVICE_NAME, MAPLE_DISCOVER_RANGE,",
      "  MAPLE_DISCOVER_CHUNKS, MAPLE_STRICT",
    ].join("\n"),
  )
}

function formatForTinybird(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19)
}

function resolveRange(options: SmokeOptions): { startTime: string; endTime: string } {
  if (options.startTime && options.endTime) {
    return {
      startTime: options.startTime,
      endTime: options.endTime,
    }
  }

  const resolved = relativeToAbsolute(options.preset)
  if (!resolved) {
    throw new Error(`Invalid preset: ${options.preset}`)
  }

  return resolved
}

function toHeaders(options: SmokeOptions): Record<string, string> {
  const headers: Record<string, string> = {}

  if (options.orgId) headers["x-maple-org-id"] = options.orgId
  if (options.userId) headers["x-maple-user-id"] = options.userId
  if (options.apiKey) headers["x-api-key"] = options.apiKey
  if (options.bearerToken) headers.authorization = `Bearer ${options.bearerToken}`

  return headers
}

function createDefaultQueries(service?: string): QueryBuilderQueryDraft[] {
  const first = createQueryDraft(0)
  const second = createQueryDraft(1)

  if (!service) {
    return [first, second]
  }

  first.whereClause = `service.name = "${service}"`
  second.whereClause = `service.name = "${service}" AND deployment.environment = "production"`

  return [first, second]
}

async function executeTimeseriesQuery(
  startTime: string,
  endTime: string,
  spec: QuerySpec,
  executeQueryEngine: (payload: {
    startTime: string
    endTime: string
    query: QuerySpec
  }) => Promise<{
    result:
      | {
          kind: "timeseries"
          source: string
          data: Array<{ bucket: string; series: Record<string, number> }>
        }
      | { kind: "breakdown"; source: string; data: Array<{ name: string; value: number }> }
  }>,
): Promise<TimeseriesPoint[]> {
  const response = await executeQueryEngine({
    startTime,
    endTime,
    query: spec,
  })

  if (response.result.kind !== "timeseries") {
    throw new Error(`Unexpected non-timeseries result: ${response.result.kind}`)
  }

  return response.result.data.map((point) => ({
    bucket: point.bucket,
    series: { ...point.series },
  }))
}

function hasSeries(points: TimeseriesPoint[]): boolean {
  return points.some((point) => Object.keys(point.series).length > 0)
}

async function discoverRecentWindowWithData(
  executeQueryEngine: (payload: {
    startTime: string
    endTime: string
    query: QuerySpec
  }) => Promise<{
    result:
      | {
          kind: "timeseries"
          source: string
          data: Array<{ bucket: string; series: Record<string, number> }>
        }
      | { kind: "breakdown"; source: string; data: Array<{ name: string; value: number }> }
  }>,
  options: Pick<SmokeOptions, "service" | "discoverChunks">,
): Promise<{ startTime: string; endTime: string } | null> {
  const chunkMs = 31 * 24 * 60 * 60 * 1000
  const hourMs = 60 * 60 * 1000

  for (let chunkIndex = 0; chunkIndex < options.discoverChunks; chunkIndex += 1) {
    const chunkEndMs = Date.now() - chunkIndex * chunkMs
    const chunkStartMs = chunkEndMs - chunkMs

    const response = await executeQueryEngine({
      startTime: formatForTinybird(new Date(chunkStartMs)),
      endTime: formatForTinybird(new Date(chunkEndMs)),
      query: {
        kind: "timeseries",
        source: "traces",
        metric: "count",
        groupBy: "service",
        ...(options.service
          ? {
              filters: {
                serviceName: options.service,
              },
            }
          : {}),
      },
    })

    if (response.result.kind !== "timeseries") {
      continue
    }

    const latest = [...response.result.data]
      .reverse()
      .find((point) => Object.keys(point.series).length > 0)

    if (!latest) {
      continue
    }

    const bucketMs = new Date(latest.bucket).getTime()
    if (Number.isNaN(bucketMs)) {
      continue
    }

    return {
      startTime: formatForTinybird(new Date(bucketMs - hourMs)),
      endTime: formatForTinybird(new Date(bucketMs + hourMs)),
    }
  }

  return null
}

async function run(): Promise<number> {
  const options = parseArgs(process.argv.slice(2))
  const initialRange = resolveRange(options)
  const queries = createDefaultQueries(options.service)
  const formulas = [
    {
      id: "formula-1",
      name: "F1",
      expression: "A / B",
      legend: "Error ratio",
    },
  ]

  const headers = toHeaders(options)
  const client = createMapleApiClient({
    baseUrl: options.apiBaseUrl,
    getHeaders: () => headers,
  })

  let range = initialRange
  if (options.discover && !options.startTime && !options.endTime) {
    const discovered = await discoverRecentWindowWithData(
      (payload) => client.executeQueryEngine(payload),
      options,
    )
    if (discovered) {
      range = discovered
    } else {
      console.log("Discovery mode: no trace data found in scanned historical chunks.")
      console.log("")
    }
  }

  const strategy = queryBuilderTestables.resolveStrategy({
    startTime: range.startTime,
    endTime: range.endTime,
    queries,
    formulas,
  })

  const attemptLogs = new Map<string, AttemptLog[]>()
  const queryResults: QueryRunResult[] = []

  for (const query of queries.filter((item) => item.enabled)) {
    const built = buildTimeseriesQuerySpec(query)
    if (!built.query) {
      queryResults.push({
        queryId: query.id,
        queryName: query.name,
        source: query.dataSource,
        status: "error",
        error: built.error ?? "Failed to build query",
        warnings: built.warnings,
        data: [],
      })
      continue
    }

    const querySpec = queryBuilderTestables.resolveTimeseriesBucketSpec(
      built.query,
      range.startTime,
      range.endTime,
    )
    const attempts: AttemptLog[] = []
    attemptLogs.set(query.name, attempts)

    try {
      const execution = await queryBuilderTestables.executeTimeseriesQueryWithFallbackUsing(
        range.startTime,
        range.endTime,
        querySpec,
        strategy,
        true,
        async (windowStart, windowEnd, windowSpec) => {
          if (windowSpec.kind === "timeseries") {
            attempts.push({
              startTime: windowStart,
              endTime: windowEnd,
              bucketSeconds: windowSpec.bucketSeconds,
            })
          }

          return executeTimeseriesQuery(
            windowStart,
            windowEnd,
            windowSpec,
            (payload) => client.executeQueryEngine(payload),
          )
        },
      )

      queryResults.push({
        queryId: query.id,
        queryName: query.name,
        source: query.dataSource,
        status: "success",
        error: null,
        warnings: built.warnings,
        data: execution.points,
      })
    } catch (error) {
      queryResults.push({
        queryId: query.id,
        queryName: query.name,
        source: query.dataSource,
        status: "error",
        error: error instanceof Error ? error.message : "Query execution failed",
        warnings: built.warnings,
        data: [],
      })
    }
  }

  const formulaResults = buildFormulaResults(formulas, queryResults)
  const successfulQueryCount = queryBuilderTestables.countSuccessfulQuerySeries(queryResults)

  console.log("=== Query Builder Live Smoke ===")
  console.log(`API Base URL: ${options.apiBaseUrl}`)
  console.log(`Range: ${range.startTime} -> ${range.endTime}`)
  if (options.service) {
    console.log(`Service filter: ${options.service}`)
  }
  console.log(`Strict mode: ${options.strict ? "on" : "off"}`)
  console.log("")

  console.log("Base query results:")
  for (const result of queryResults) {
    const points = result.data.length
    const hasSeriesData = hasSeries(result.data)
    console.log(
      `  [${result.queryName}] status=${result.status} points=${points} hasSeries=${hasSeriesData}`,
    )
    if (result.error) {
      console.log(`    error: ${result.error}`)
    }
    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.log(`    warning: ${warning}`)
      }
    }

    const attempts = attemptLogs.get(result.queryName) ?? []
    for (const attempt of attempts) {
      console.log(
        `    attempt: ${attempt.startTime} -> ${attempt.endTime} bucket=${attempt.bucketSeconds ?? "auto"}`,
      )
    }
  }

  console.log("")
  console.log("Formula results:")
  for (const result of formulaResults) {
    const points = result.data.length
    console.log(`  [${result.queryName}] status=${result.status} points=${points}`)
    if (result.error) {
      console.log(`    error: ${result.error}`)
    }
    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.log(`    warning: ${warning}`)
      }
    }
  }

  console.log("")
  if (successfulQueryCount === 0) {
    const reason = queryBuilderTestables.noQueryDataMessage(queryResults)
    console.log(`FAIL: No base query series data. ${reason}`)
    return options.strict ? 1 : 0
  }

  console.log(`PASS: Found series data in ${successfulQueryCount} base quer${successfulQueryCount === 1 ? "y" : "ies"}.`)
  return 0
}

run()
  .then((exitCode) => {
    process.exit(exitCode)
  })
  .catch((error) => {
    console.error("Smoke runner crashed:", error)
    process.exit(1)
  })
