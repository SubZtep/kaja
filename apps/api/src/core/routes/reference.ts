import { OpenAPIHono } from "@hono/zod-openapi"
import { Scalar } from "@scalar/hono-api-reference"
import type { RouteProps } from "#/types"
import { version } from "../../../package.json"

export const referenceRoutes = new OpenAPIHono<RouteProps>()

// API documentation UI
referenceRoutes.get(
  "/",
  Scalar({
    url: "/reference/openapi.json",
    pageTitle: "Kaja API Reference",
    theme: "solarized",
    darkMode: true,
    hiddenClients: true,
    hideSearch: true,
    hideClientButton: true,
    hideDarkModeToggle: true,
    hideTestRequestButton: true,
    documentDownloadType: "none",
    showDeveloperTools: "never",
    persistAuth: true,
    telemetry: false,
    agent: {
      disabled: true
    },
    mcp: {
      disabled: true
    }
  })
)

/** Setup OpenAPI documentation schema on the main app. */
export function setupApiDocs(app: OpenAPIHono<RouteProps>) {
  app.doc("/reference/openapi.json", {
    openapi: "3.1.1",
    info: {
      title: "Kaja.io API",
      version,
      description: "Custom endpoints reference. [Click here](/auth/reference) for auth endpoints."
    }
  })
}
