import { describe, expect, it } from "bun:test"
import * as JSONSchema from "effect/JSONSchema"
import * as ParseResult from "effect/ParseResult"
import * as Schema from "effect/Schema"
import { buildQuerySpec, queryDataArgsSchema } from "./query-data"

describe("query_data", () => {
  const decode = Schema.validateEither(queryDataArgsSchema)

  it("rejects metrics breakdown min via the public schema", () => {
    const result = decode({
      source: "metrics",
      kind: "breakdown",
      metric: "min",
      metric_name: "request.duration",
      metric_type: "histogram",
    })

    expect(result._tag).toBe("Left")
  })

  it("rejects metrics breakdown group_by=none via the public schema", () => {
    const result = decode({
      source: "metrics",
      kind: "breakdown",
      group_by: "none",
      metric_name: "request.duration",
      metric_type: "histogram",
    })

    expect(result._tag).toBe("Left")
  })

  it("rejects traces attribute grouping without attribute_key", () => {
    const result = buildQuerySpec({
      source: "traces",
      kind: "breakdown",
      group_by: "attribute",
    } as unknown as Parameters<typeof buildQuerySpec>[0])

    expect(result).toEqual({
      error: "`group_by=attribute` requires `attribute_key`.",
    })
  })

  it("requires metric_name and metric_type for metrics queries", () => {
    const result = decode({
      source: "metrics",
      kind: "timeseries",
      metric: "avg",
    })

    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      const message = ParseResult.TreeFormatter.formatErrorSync(result.left)
      expect(message).toContain("metric_name")
      expect(message).toContain("metric_type")
    }
  })

  it("builds the expected QuerySpec for supported branches", () => {
    const cases = [
      {
        input: {
          source: "traces",
          kind: "timeseries",
          metric: "count",
          group_by: "http_method",
          bucket_seconds: 300,
        } as const,
        expected: {
          kind: "timeseries",
          source: "traces",
          metric: "count",
          groupBy: "http_method",
          bucketSeconds: 300,
        },
      },
      {
        input: {
          source: "traces",
          kind: "breakdown",
          metric: "p95_duration",
          group_by: "service",
          limit: 5,
        } as const,
        expected: {
          kind: "breakdown",
          source: "traces",
          metric: "p95_duration",
          groupBy: "service",
          limit: 5,
        },
      },
      {
        input: {
          source: "logs",
          kind: "timeseries",
          group_by: "severity",
        } as const,
        expected: {
          kind: "timeseries",
          source: "logs",
          metric: "count",
          groupBy: "severity",
        },
      },
      {
        input: {
          source: "logs",
          kind: "breakdown",
          group_by: "service",
          severity: "ERROR",
        } as const,
        expected: {
          kind: "breakdown",
          source: "logs",
          metric: "count",
          groupBy: "service",
          filters: {
            severity: "ERROR",
          },
        },
      },
      {
        input: {
          source: "metrics",
          kind: "timeseries",
          metric: "max",
          group_by: "none",
          metric_name: "request.duration",
          metric_type: "histogram",
        } as const,
        expected: {
          kind: "timeseries",
          source: "metrics",
          metric: "max",
          groupBy: "none",
          filters: {
            metricName: "request.duration",
            metricType: "histogram",
          },
        },
      },
      {
        input: {
          source: "metrics",
          kind: "breakdown",
          metric: "sum",
          metric_name: "request.count",
          metric_type: "sum",
          limit: 10,
        } as const,
        expected: {
          kind: "breakdown",
          source: "metrics",
          metric: "sum",
          groupBy: "service",
          filters: {
            metricName: "request.count",
            metricType: "sum",
          },
          limit: 10,
        },
      },
    ]

    for (const testCase of cases) {
      const result = buildQuerySpec(testCase.input as Parameters<typeof buildQuerySpec>[0])
      expect(result as unknown).toEqual({ spec: testCase.expected })
    }
  })

  it("generates a union schema for tools/list", () => {
    const schema = JSONSchema.make(queryDataArgsSchema) as unknown as Record<string, unknown>
    const variants = (schema.oneOf ?? schema.anyOf) as Array<unknown> | undefined

    expect(Array.isArray(variants)).toBe(true)
    expect(variants?.length).toBe(6)
  })
})
