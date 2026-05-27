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
    pageTitle: "Kaja.io API Reference",
    theme: "solarized",
    darkMode: true,
    hiddenClients: true,
    hideSearch: true,
    hideClientButton: true,
    hideDarkModeToggle: true,
    hideTestRequestButton: true,
    documentDownloadType: "none",
    showDeveloperTools: "never",
    favicon: "https://kaja.io/favicon.ico",
    withDefaultFonts: false,
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
    openapi: "3.2.0",
    tags: [
      {
        name: "Nodes",
        description: "Managing CLI nodes connected to the API."
      },
      {
        name: "Users",
        description: "User related random stuff."
      },
      {
        name: "Admin",
        description: "Web interface related endpoints."
      },
      {
        name: "System",
        description: "Health check."
      }
    ],
    externalDocs: {
      description: "Auth Endpoints",
      url: "/auth/reference"
    },
    info: {
      title: "API Reference",
      version,
      description: `
Custom endpoints reference for _Kaja.io_.

_wip_
`
    }
  })
}
