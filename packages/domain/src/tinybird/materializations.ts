import { defineMaterializedView, node } from "@tinybirdco/sdk";
import {
  serviceUsage,
} from "./datasources";

/**
 * Materialized view to aggregate log usage statistics per service per hour
 */
export const serviceUsageLogsMv = defineMaterializedView(
  "service_usage_logs_mv",
  {
    description:
      "Materialized view to aggregate log usage statistics per service per hour",
    datasource: serviceUsage,
    nodes: [
      node({
        name: "service_usage_logs_mv_node",
        sql: `
        SELECT
          OrgId,
          ServiceName,
          toStartOfHour(TimestampTime) AS Hour,
          count() AS LogCount,
          sum(length(Body) + 200) AS LogSizeBytes,
          0 AS TraceCount,
          0 AS TraceSizeBytes,
          0 AS SumMetricCount,
          0 AS SumMetricSizeBytes,
          0 AS GaugeMetricCount,
          0 AS GaugeMetricSizeBytes,
          0 AS HistogramMetricCount,
          0 AS HistogramMetricSizeBytes,
          0 AS ExpHistogramMetricCount,
          0 AS ExpHistogramMetricSizeBytes
        FROM logs
        GROUP BY OrgId, ServiceName, Hour
      `,
      }),
    ],
  }
);

/**
 * Materialized view to aggregate trace/span usage statistics per service per hour
 */
export const serviceUsageTracesMv = defineMaterializedView(
  "service_usage_traces_mv",
  {
    description:
      "Materialized view to aggregate trace/span usage statistics per service per hour",
    datasource: serviceUsage,
    nodes: [
      node({
        name: "service_usage_traces_mv_node",
        sql: `
        SELECT
          OrgId,
          ServiceName,
          toStartOfHour(toDateTime(Timestamp)) AS Hour,
          0 AS LogCount,
          0 AS LogSizeBytes,
          count() AS TraceCount,
          sum(length(SpanName) + 300) AS TraceSizeBytes,
          0 AS SumMetricCount,
          0 AS SumMetricSizeBytes,
          0 AS GaugeMetricCount,
          0 AS GaugeMetricSizeBytes,
          0 AS HistogramMetricCount,
          0 AS HistogramMetricSizeBytes,
          0 AS ExpHistogramMetricCount,
          0 AS ExpHistogramMetricSizeBytes
        FROM traces
        GROUP BY OrgId, ServiceName, Hour
      `,
      }),
    ],
  }
);

/**
 * Materialized view to aggregate sum metric usage statistics per service per hour
 */
export const serviceUsageMetricsSumMv = defineMaterializedView(
  "service_usage_metrics_sum_mv",
  {
    description:
      "Materialized view to aggregate sum metric usage statistics per service per hour",
    datasource: serviceUsage,
    nodes: [
      node({
        name: "service_usage_metrics_sum_mv_node",
        sql: `
        SELECT
          OrgId,
          ServiceName,
          toStartOfHour(toDateTime(TimeUnix)) AS Hour,
          0 AS LogCount,
          0 AS LogSizeBytes,
          0 AS TraceCount,
          0 AS TraceSizeBytes,
          count() AS SumMetricCount,
          count() * 150 AS SumMetricSizeBytes,
          0 AS GaugeMetricCount,
          0 AS GaugeMetricSizeBytes,
          0 AS HistogramMetricCount,
          0 AS HistogramMetricSizeBytes,
          0 AS ExpHistogramMetricCount,
          0 AS ExpHistogramMetricSizeBytes
        FROM metrics_sum
        GROUP BY OrgId, ServiceName, Hour
      `,
      }),
    ],
  }
);

/**
 * Materialized view to aggregate gauge metric usage statistics per service per hour
 */
export const serviceUsageMetricsGaugeMv = defineMaterializedView(
  "service_usage_metrics_gauge_mv",
  {
    description:
      "Materialized view to aggregate gauge metric usage statistics per service per hour",
    datasource: serviceUsage,
    nodes: [
      node({
        name: "service_usage_metrics_gauge_mv_node",
        sql: `
        SELECT
          OrgId,
          ServiceName,
          toStartOfHour(toDateTime(TimeUnix)) AS Hour,
          0 AS LogCount,
          0 AS LogSizeBytes,
          0 AS TraceCount,
          0 AS TraceSizeBytes,
          0 AS SumMetricCount,
          0 AS SumMetricSizeBytes,
          count() AS GaugeMetricCount,
          count() * 150 AS GaugeMetricSizeBytes,
          0 AS HistogramMetricCount,
          0 AS HistogramMetricSizeBytes,
          0 AS ExpHistogramMetricCount,
          0 AS ExpHistogramMetricSizeBytes
        FROM metrics_gauge
        GROUP BY OrgId, ServiceName, Hour
      `,
      }),
    ],
  }
);

/**
 * Materialized view to aggregate histogram metric usage statistics per service per hour
 */
export const serviceUsageMetricsHistogramMv = defineMaterializedView(
  "service_usage_metrics_histogram_mv",
  {
    description:
      "Materialized view to aggregate histogram metric usage statistics per service per hour",
    datasource: serviceUsage,
    nodes: [
      node({
        name: "service_usage_metrics_histogram_mv_node",
        sql: `
        SELECT
          OrgId,
          ServiceName,
          toStartOfHour(toDateTime(TimeUnix)) AS Hour,
          0 AS LogCount,
          0 AS LogSizeBytes,
          0 AS TraceCount,
          0 AS TraceSizeBytes,
          0 AS SumMetricCount,
          0 AS SumMetricSizeBytes,
          0 AS GaugeMetricCount,
          0 AS GaugeMetricSizeBytes,
          count() AS HistogramMetricCount,
          count() * 250 AS HistogramMetricSizeBytes,
          0 AS ExpHistogramMetricCount,
          0 AS ExpHistogramMetricSizeBytes
        FROM metrics_histogram
        GROUP BY OrgId, ServiceName, Hour
      `,
      }),
    ],
  }
);

/**
 * Materialized view to aggregate exponential histogram metric usage statistics per service per hour
 */
export const serviceUsageMetricsExpHistogramMv = defineMaterializedView(
  "service_usage_metrics_exp_histogram_mv",
  {
    description:
      "Materialized view to aggregate exponential histogram metric usage statistics per service per hour",
    datasource: serviceUsage,
    nodes: [
      node({
        name: "service_usage_metrics_exp_histogram_mv_node",
        sql: `
        SELECT
          OrgId,
          ServiceName,
          toStartOfHour(toDateTime(TimeUnix)) AS Hour,
          0 AS LogCount,
          0 AS LogSizeBytes,
          0 AS TraceCount,
          0 AS TraceSizeBytes,
          0 AS SumMetricCount,
          0 AS SumMetricSizeBytes,
          0 AS GaugeMetricCount,
          0 AS GaugeMetricSizeBytes,
          0 AS HistogramMetricCount,
          0 AS HistogramMetricSizeBytes,
          count() AS ExpHistogramMetricCount,
          count() * 300 AS ExpHistogramMetricSizeBytes
        FROM metrics_exponential_histogram
        GROUP BY OrgId, ServiceName, Hour
      `,
      }),
    ],
  }
);


