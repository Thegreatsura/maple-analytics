export interface IntegrationStep {
  title: string
  code: string
  language: string
}

export interface IntegrationSignal {
  title: string
  description: string
}

export interface Integration {
  name: string
  slug: string
  language: string
  description: string
  steps: IntegrationStep[]
  signals: IntegrationSignal[]
}

export const integrations: Record<string, Integration> = {
  nextjs: {
    name: "Next.js",
    slug: "nextjs",
    language: "typescript",
    description:
      "Add OpenTelemetry tracing to your Next.js application with Vercel's built-in instrumentation hook. Capture server components, API routes, and middleware spans automatically.",
    steps: [
      {
        title: "Install dependencies",
        code: `npm install @vercel/otel @opentelemetry/api`,
        language: "bash",
      },
      {
        title: "Configure exporter",
        code: `// instrumentation.ts
import { registerOTel } from "@vercel/otel"

export function register() {
  registerOTel({
    serviceName: "my-nextjs-app",
    traceExporter: "otlp",
    // Point to your Maple OTLP endpoint
    attributes: {
      "deployment.environment": process.env.NODE_ENV,
    },
  })
}`,
        language: "typescript",
      },
      {
        title: "See your data",
        code: `# Set the OTLP endpoint environment variable
export OTEL_EXPORTER_OTLP_ENDPOINT="https://your-maple-instance.example.com"
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <your-token>"

# Deploy your app and traces will appear in Maple
npm run build && npm start`,
        language: "bash",
      },
    ],
    signals: [
      {
        title: "HTTP routes",
        description: "Automatic spans for every page and route handler request with method, status, and duration.",
      },
      {
        title: "API routes",
        description: "Full tracing of API route handlers including request/response metadata.",
      },
      {
        title: "Server Components",
        description: "Spans for React Server Component rendering and data fetching.",
      },
      {
        title: "Middleware",
        description: "Traces for Next.js middleware execution including redirects and rewrites.",
      },
      {
        title: "Database queries",
        description: "Automatic instrumentation of Prisma, Drizzle, and other database clients.",
      },
      {
        title: "External API calls",
        description: "Outgoing HTTP requests traced with fetch instrumentation and context propagation.",
      },
    ],
  },
  python: {
    name: "Python",
    slug: "python",
    language: "python",
    description:
      "Instrument your Python application with zero code changes using OpenTelemetry auto-instrumentation. Supports Flask, FastAPI, Django, and dozens of popular libraries out of the box.",
    steps: [
      {
        title: "Install dependencies",
        code: `pip install opentelemetry-distro opentelemetry-exporter-otlp`,
        language: "bash",
      },
      {
        title: "Configure exporter",
        code: `# Set environment variables for OTLP export
export OTEL_SERVICE_NAME="my-python-app"
export OTEL_EXPORTER_OTLP_ENDPOINT="https://your-maple-instance.example.com"
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <your-token>"
export OTEL_TRACES_EXPORTER="otlp"
export OTEL_LOGS_EXPORTER="otlp"
export OTEL_METRICS_EXPORTER="otlp"

# Install auto-instrumentation packages for detected libraries
opentelemetry-bootstrap -a install`,
        language: "bash",
      },
      {
        title: "Run with auto-instrumentation",
        code: `# Start your application with the OpenTelemetry instrument wrapper
opentelemetry-instrument python app.py`,
        language: "bash",
      },
    ],
    signals: [
      {
        title: "Flask/FastAPI routes",
        description: "Automatic spans for every HTTP request with route, method, and status code attributes.",
      },
      {
        title: "SQLAlchemy queries",
        description: "Database query spans with statement text, connection details, and execution duration.",
      },
      {
        title: "HTTP requests",
        description: "Outgoing requests via urllib3 and the requests library traced with context propagation.",
      },
      {
        title: "Redis calls",
        description: "Redis command spans with operation type, key patterns, and response time.",
      },
      {
        title: "Celery tasks",
        description: "Distributed task spans that link producers and consumers across worker processes.",
      },
      {
        title: "gRPC calls",
        description: "Client and server gRPC spans with service, method, and status code attributes.",
      },
    ],
  },
  nodejs: {
    name: "Node.js",
    slug: "nodejs",
    language: "typescript",
    description:
      "Add distributed tracing to any Node.js application with the OpenTelemetry SDK. Auto-instrumentation captures Express, Fastify, database queries, and HTTP calls with no code changes.",
    steps: [
      {
        title: "Install dependencies",
        code: `npm install @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/sdk-node`,
        language: "bash",
      },
      {
        title: "Configure tracing",
        code: `// tracing.ts
import { NodeSDK } from "@opentelemetry/sdk-node"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"

const sdk = new NodeSDK({
  serviceName: "my-node-app",
  traceExporter: new OTLPTraceExporter({
    url: "https://your-maple-instance.example.com/v1/traces",
    headers: {
      Authorization: "Bearer <your-token>",
    },
  }),
  instrumentations: [getNodeAutoInstrumentations()],
})

sdk.start()`,
        language: "typescript",
      },
      {
        title: "Start your app",
        code: `# Require the tracing module before your application code
node --require ./tracing.js app.js`,
        language: "bash",
      },
    ],
    signals: [
      {
        title: "Express/Fastify routes",
        description: "Automatic spans for every HTTP request with route pattern, method, and response status.",
      },
      {
        title: "PostgreSQL/MySQL queries",
        description: "Database spans with query text, connection info, and execution duration via pg and mysql2.",
      },
      {
        title: "HTTP client calls",
        description: "Outgoing HTTP requests traced with context propagation across service boundaries.",
      },
      {
        title: "Redis operations",
        description: "Redis command spans with operation type, key patterns, and latency tracking.",
      },
      {
        title: "gRPC services",
        description: "Full client and server gRPC tracing with service name, method, and status attributes.",
      },
      {
        title: "File system operations",
        description: "Spans for file reads, writes, and directory operations with path and size metadata.",
      },
    ],
  },
}
