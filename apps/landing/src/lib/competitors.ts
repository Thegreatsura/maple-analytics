export interface CompetitorFeature {
  maple: string | boolean
  competitor: string | boolean
}

export interface Competitor {
  name: string
  slug: string
  tagline: string
  description: string
  features: Record<string, CompetitorFeature>
}

export const competitors: Record<string, Competitor> = {
  datadog: {
    name: "Datadog",
    slug: "datadog",
    tagline: "Open-source observability without the surprise bills",
    description:
      "Maple gives you the same distributed tracing, log management, and metrics dashboards as Datadog — built on OpenTelemetry with transparent usage-based pricing and no vendor lock-in.",
    features: {
      "Pricing model": {
        maple: "Usage-based, transparent",
        competitor: "Complex per-host + per-GB",
      },
      "Open source": {
        maple: true,
        competitor: false,
      },
      "OpenTelemetry native": {
        maple: true,
        competitor: false,
      },
      "Distributed tracing": {
        maple: true,
        competitor: true,
      },
      "Log management": {
        maple: true,
        competitor: true,
      },
      "Metrics & dashboards": {
        maple: true,
        competitor: true,
      },
      "AI / MCP integration": {
        maple: true,
        competitor: false,
      },
      "Self-hosting available": {
        maple: true,
        competitor: false,
      },
      "No vendor lock-in": {
        maple: true,
        competitor: false,
      },
      "Custom dashboards": {
        maple: true,
        competitor: true,
      },
      Alerting: {
        maple: true,
        competitor: true,
      },
    },
  },
  grafana: {
    name: "Grafana",
    slug: "grafana",
    tagline: "The simplicity of Grafana with zero configuration overhead",
    description:
      "Maple delivers the open-source flexibility of Grafana Cloud with a purpose-built OpenTelemetry backend — no Prometheus, Loki, or Tempo stack to configure and maintain.",
    features: {
      "Pricing model": {
        maple: "Usage-based, transparent",
        competitor: "Usage-based + self-host",
      },
      "Open source": {
        maple: true,
        competitor: true,
      },
      "OpenTelemetry native": {
        maple: true,
        competitor: true,
      },
      "Distributed tracing": {
        maple: true,
        competitor: true,
      },
      "Log management": {
        maple: true,
        competitor: true,
      },
      "Metrics & dashboards": {
        maple: true,
        competitor: true,
      },
      "AI / MCP integration": {
        maple: true,
        competitor: false,
      },
      "Self-hosting available": {
        maple: true,
        competitor: true,
      },
      "No vendor lock-in": {
        maple: true,
        competitor: true,
      },
      "Custom dashboards": {
        maple: true,
        competitor: true,
      },
      Alerting: {
        maple: true,
        competitor: true,
      },
    },
  },
  "new-relic": {
    name: "New Relic",
    slug: "new-relic",
    tagline: "Full-stack observability without per-seat pricing",
    description:
      "Maple provides the same full-stack observability as New Relic — traces, logs, and metrics — with OpenTelemetry-native ingestion, no per-seat fees, and the freedom to self-host.",
    features: {
      "Pricing model": {
        maple: "Usage-based, transparent",
        competitor: "Per-seat + per-GB",
      },
      "Open source": {
        maple: true,
        competitor: false,
      },
      "OpenTelemetry native": {
        maple: true,
        competitor: true,
      },
      "Distributed tracing": {
        maple: true,
        competitor: true,
      },
      "Log management": {
        maple: true,
        competitor: true,
      },
      "Metrics & dashboards": {
        maple: true,
        competitor: true,
      },
      "AI / MCP integration": {
        maple: true,
        competitor: false,
      },
      "Self-hosting available": {
        maple: true,
        competitor: false,
      },
      "No vendor lock-in": {
        maple: true,
        competitor: false,
      },
      "Custom dashboards": {
        maple: true,
        competitor: true,
      },
      Alerting: {
        maple: true,
        competitor: true,
      },
    },
  },
}

export const featureOrder = [
  "Pricing model",
  "Open source",
  "OpenTelemetry native",
  "Distributed tracing",
  "Log management",
  "Metrics & dashboards",
  "AI / MCP integration",
  "Self-hosting available",
  "No vendor lock-in",
  "Custom dashboards",
  "Alerting",
] as const
