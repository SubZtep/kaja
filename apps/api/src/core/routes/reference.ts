import { OpenAPIHono } from "@hono/zod-openapi"
import { Scalar } from "@scalar/hono-api-reference"
import { version } from "../../../package.json"
import type { RouteProps } from "../../types"

export const referenceRoutes = new OpenAPIHono<RouteProps>()

// API documentation UI
referenceRoutes.get(
  "/",
  Scalar({
    url: "/reference/openapi.json",
    pageTitle: "Kaja.io API Reference",
    theme: "purple",
    darkMode: true,
    forceDarkModeState: "dark",
    isLoading: true,
    hiddenClients: true,
    hideSearch: true,
    hideClientButton: true,
    hideDarkModeToggle: true,
    hideTestRequestButton: true,
    documentDownloadType: "none",
    showDeveloperTools: "never",
    favicon: "https://kaja.io/favicon.ico",
    customCss: `* { letter-spacing: 0.5px; }`,
    orderRequiredPropertiesFirst: true,
    operationTitleSource: "path",
    operationsSorter: "alpha",
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
      description: "Visit Auth Endpoints Reference",
      url: "/auth/reference"
    },
    info: {
      title: "API Reference",
      version,
      description: `
Custom endpoints reference for _Kaja.io_.

This documentation is auto-generated from the API’s OpenAPI schema and provides details on all available endpoints, request/response formats, and authentication requirements.

This document is accessible in development mode only.
`
    }
  })
}
