---
title: "Node.js Instrumentation"
description: "Instrument a Node.js application with OpenTelemetry and send traces, logs, and metrics to Maple."
group: "Guides"
order: 3
---

This guide covers instrumenting a Node.js application to send traces and logs to Maple using the OpenTelemetry SDK.

## Prerequisites

- Node.js 18+
- A Maple project with an API key

## Install Dependencies

```bash
npm install @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-logs-otlp-http
```

## Configure the SDK

Create a `tracing.js` file that initializes the SDK before your application code:

```javascript
// tracing.js
const { NodeSDK } = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
const { OTLPLogExporter } = require("@opentelemetry/exporter-logs-otlp-http");
const { SimpleLogRecordProcessor } = require("@opentelemetry/sdk-logs");
const { Resource } = require("@opentelemetry/resources");

const sdk = new NodeSDK({
  resource: new Resource({
    "service.name": "my-node-app",
    "deployment.environment": process.env.NODE_ENV || "development",
    "deployment.commit_sha": process.env.COMMIT_SHA,
  }),
  traceExporter: new OTLPTraceExporter({
    url: "https://ingest.maple.dev/v1/traces",
    headers: { Authorization: "Bearer YOUR_API_KEY" },
  }),
  logRecordProcessors: [
    new SimpleLogRecordProcessor(
      new OTLPLogExporter({
        url: "https://ingest.maple.dev/v1/logs",
        headers: { Authorization: "Bearer YOUR_API_KEY" },
      })
    ),
  ],
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

Run your application with the tracing file loaded first:

```bash
node --require ./tracing.js app.js
```

For ES modules, use the `--import` flag with a register hook instead.

## Auto-Instrumentation

`getNodeAutoInstrumentations()` automatically instruments common libraries including HTTP, Express, Fastify, pg, MySQL, Redis, and many more.

To disable specific instrumentations:

```javascript
instrumentations: [
  getNodeAutoInstrumentations({
    "@opentelemetry/instrumentation-fs": { enabled: false },
    "@opentelemetry/instrumentation-dns": { enabled: false },
  }),
],
```

## Custom Spans

Create custom spans to trace specific operations in your code:

```javascript
const { trace, SpanStatusCode } = require("@opentelemetry/api");

const tracer = trace.getTracer("my-app");

async function processOrder(orderId) {
  return tracer.startActiveSpan("process-order", async (span) => {
    try {
      span.setAttribute("order.id", orderId);
      // Set peer.service when calling another service
      span.setAttribute("peer.service", "payment-api");
      const result = await chargePayment(orderId);
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

Setting `peer.service` on outgoing calls makes them visible on Maple's [service map](/docs/concepts/otel-conventions#service-map).

## Log Correlation

The OpenTelemetry log SDK automatically includes trace context (`TraceId`, `SpanId`) with log records emitted during an active span. This enables correlated log views in Maple.

For structured logging with pino, use `pino-opentelemetry-transport` to bridge pino logs to the OTel log SDK.

## Next.js

If you're using Next.js, use the `@vercel/otel` package:

```bash
npm install @vercel/otel @opentelemetry/sdk-logs @opentelemetry/exporter-logs-otlp-http
```

```typescript
// instrumentation.ts (project root)
import { registerOTel } from "@vercel/otel";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";

export function register() {
  registerOTel({
    serviceName: "my-next-app",
    attributes: { environment: "production" },
    traceExporter: { url: "https://ingest.maple.dev/v1/traces" },
    logRecordProcessor: new SimpleLogRecordProcessor(
      new OTLPLogExporter({
        url: "https://ingest.maple.dev/v1/logs",
        headers: { Authorization: "Bearer YOUR_API_KEY" },
      })
    ),
  });
}
```

Enable the instrumentation hook in `next.config.js`:

```javascript
module.exports = {
  experimental: { instrumentationHook: true },
};
```

## Effect

If you're using Effect, the `@maple-dev/effect-sdk` provides a pre-configured layer:

```bash
npm install @maple-dev/effect-sdk effect
```

```typescript
import { Maple } from "@maple-dev/effect-sdk";
import { Effect } from "effect";

// Auto-detects MAPLE_ENDPOINT, MAPLE_INGEST_KEY,
// commit SHA, and deployment environment from env vars
const TracerLive = Maple.layer({
  serviceName: "my-effect-app",
});

const program = Effect.gen(function* () {
  yield* Effect.log("Hello from Effect!");
}).pipe(Effect.withSpan("hello-maple"));

Effect.runPromise(program.pipe(Effect.provide(TracerLive)));
```

The Effect SDK auto-detects environment variables for commit SHA (`COMMIT_SHA`, `RAILWAY_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_SHA`) and environment (`MAPLE_ENVIRONMENT`, `RAILWAY_ENVIRONMENT`, `VERCEL_ENV`, `NODE_ENV`).

## Verify

1. Start your application
2. Generate some traffic (send a request, trigger an operation)
3. Open the Maple dashboard and check that traces appear in the traces view

If traces aren't appearing, verify:
- The ingest endpoint URL is correct
- Your API key is valid
- Your application can reach `ingest.maple.dev` (or your self-hosted URL)
