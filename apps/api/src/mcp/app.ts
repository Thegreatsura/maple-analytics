import { McpServer } from "effect/unstable/ai"
import { Layer } from "effect"
import { McpToolsLive } from "./server"

export const McpLive = McpToolsLive.pipe(
  Layer.provide(
    McpServer.layerHttp({
      name: "maple-observability",
      version: "1.0.0",
      path: "/mcp",
    }),
  ),
)
