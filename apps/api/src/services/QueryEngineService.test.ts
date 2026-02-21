import { describe, expect, it } from "bun:test"
import { Cause, Effect, Exit, Option } from "effect"
import type { QueryEngineExecuteRequest } from "@maple/domain"
import { makeQueryEngineExecute } from "./QueryEngineService"
import type { TenantContext } from "./AuthService"

const tenant: TenantContext = {
  orgId: "org_test",
  userId: "user_test",
  roles: [],
  authMode: "self_hosted",
}

function makeTinybirdStub(overrides: Partial<Parameters<typeof makeQueryEngineExecute>[0]> = {}) {
  const unexpected = (name: string) =>
    () =>
      Effect.die(
        new Error(`Unexpected tinybird call in test: ${name}`),
      )

  return {
    customTracesTimeseriesQuery: unexpected("customTracesTimeseriesQuery"),
    customLogsTimeseriesQuery: unexpected("customLogsTimeseriesQuery"),
    metricTimeSeriesSumQuery: unexpected("metricTimeSeriesSumQuery"),
    metricTimeSeriesGaugeQuery: unexpected("metricTimeSeriesGaugeQuery"),
    metricTimeSeriesHistogramQuery: unexpected("metricTimeSeriesHistogramQuery"),
    metricTimeSeriesExpHistogramQuery: unexpected("metricTimeSeriesExpHistogramQuery"),
    customTracesBreakdownQuery: unexpected("customTracesBreakdownQuery"),
    customLogsBreakdownQuery: unexpected("customLogsBreakdownQuery"),
    customMetricsBreakdownQuery: unexpected("customMetricsBreakdownQuery"),
    ...overrides,
  } satisfies Parameters<typeof makeQueryEngineExecute>[0]
}

describe("makeQueryEngineExecute", () => {
  const getFailure = <A, E>(exit: Exit.Exit<A, E>): E | undefined =>
    Exit.isFailure(exit) ? Option.getOrUndefined(Cause.failureOption(exit.cause)) : undefined

  it("fills missing buckets while preserving existing traces values", async () => {
    const execute = makeQueryEngineExecute(
      makeTinybirdStub({
        customTracesTimeseriesQuery: () =>
          Effect.succeed([
            {
              bucket: "2026-01-01 00:00:00",
              groupName: "checkout",
              count: 2,
              avgDuration: 0,
              p50Duration: 0,
              p95Duration: 0,
              p99Duration: 0,
              errorRate: 0,
            },
            {
              bucket: "2026-01-01 00:10:00",
              groupName: "checkout",
              count: 5,
              avgDuration: 0,
              p50Duration: 0,
              p95Duration: 0,
              p99Duration: 0,
              errorRate: 0,
            },
          ]),
      }),
    )

    const request: QueryEngineExecuteRequest = {
      startTime: "2026-01-01 00:00:00",
      endTime: "2026-01-01 00:15:00",
      query: {
        kind: "timeseries",
        source: "traces",
        metric: "count",
        groupBy: "service",
        bucketSeconds: 300,
      },
    }

    const response = await Effect.runPromise(execute(tenant, request))

    expect(response.result.kind).toBe("timeseries")
    expect(response.result.source).toBe("traces")
    expect(response.result.data).toHaveLength(4)
    expect(response.result.data[0]).toEqual({
      bucket: "2026-01-01T00:00:00.000Z",
      series: { checkout: 2 },
    })
    expect(response.result.data[1]).toEqual({
      bucket: "2026-01-01T00:05:00.000Z",
      series: {},
    })
    expect(response.result.data[2]).toEqual({
      bucket: "2026-01-01T00:10:00.000Z",
      series: { checkout: 5 },
    })
    expect(response.result.data[3]).toEqual({
      bucket: "2026-01-01T00:15:00.000Z",
      series: {},
    })
  })

  it("preserves traces series when Tinybird buckets are datetime strings", async () => {
    const execute = makeQueryEngineExecute(
      makeTinybirdStub({
        customTracesTimeseriesQuery: () =>
          Effect.succeed([
            {
              bucket: "2026-01-01 00:00:00",
              groupName: "checkout",
              count: 2,
              avgDuration: 0,
              p50Duration: 0,
              p95Duration: 0,
              p99Duration: 0,
              errorRate: 0,
            },
            {
              bucket: "2026-01-01 00:10:00",
              groupName: "checkout",
              count: 5,
              avgDuration: 0,
              p50Duration: 0,
              p95Duration: 0,
              p99Duration: 0,
              errorRate: 0,
            },
          ]),
      }),
    )

    const request: QueryEngineExecuteRequest = {
      startTime: "2026-01-01 00:00:00",
      endTime: "2026-01-01 00:15:00",
      query: {
        kind: "timeseries",
        source: "traces",
        metric: "count",
        groupBy: "service",
        bucketSeconds: 300,
      },
    }

    const response = await Effect.runPromise(execute(tenant, request))

    expect(response.result.kind).toBe("timeseries")
    expect(response.result.source).toBe("traces")
    expect(response.result.data).toHaveLength(4)
    expect(response.result.data[0]).toEqual({
      bucket: "2026-01-01T00:00:00.000Z",
      series: { checkout: 2 },
    })
    expect(response.result.data[1]).toEqual({
      bucket: "2026-01-01T00:05:00.000Z",
      series: {},
    })
    expect(response.result.data[2]).toEqual({
      bucket: "2026-01-01T00:10:00.000Z",
      series: { checkout: 5 },
    })
    expect(response.result.data[3]).toEqual({
      bucket: "2026-01-01T00:15:00.000Z",
      series: {},
    })
  })

  it("rejects timeseries requests that exceed the point budget", async () => {
    const execute = makeQueryEngineExecute(makeTinybirdStub())
    const request: QueryEngineExecuteRequest = {
      startTime: "2026-01-01 00:00:00",
      endTime: "2026-01-01 00:33:21",
      query: {
        kind: "timeseries",
        source: "traces",
        metric: "count",
        bucketSeconds: 1,
      },
    }

    const exit = await Effect.runPromiseExit(execute(tenant, request))
    const failure = getFailure(exit)

    expect(Exit.isFailure(exit)).toBe(true)
    expect(failure).toMatchObject({
      _tag: "QueryEngineValidationError",
      message: "Timeseries query too expensive",
    })
  })

  it("rejects invalid traces attribute grouping when attribute key is missing", async () => {
    const execute = makeQueryEngineExecute(makeTinybirdStub())
    const request: QueryEngineExecuteRequest = {
      startTime: "2026-01-01 00:00:00",
      endTime: "2026-01-01 00:05:00",
      query: {
        kind: "timeseries",
        source: "traces",
        metric: "count",
        groupBy: "attribute",
      },
    }

    const exit = await Effect.runPromiseExit(execute(tenant, request))
    const failure = getFailure(exit)

    expect(Exit.isFailure(exit)).toBe(true)
    expect(failure).toMatchObject({
      _tag: "QueryEngineValidationError",
      message: "Invalid traces attribute filters",
    })
  })
})
