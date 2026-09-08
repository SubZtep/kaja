import { createHash } from "node:crypto"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { configExportBundleSchema } from "@kaja/schema/api"
import type { Context } from "hono"
import { mcpServerService, modelService, personaService } from "../../services"
import { renderMcpToml, renderModelsToml, renderPersonaToml } from "../../services/config-export"
import type { RouteProps } from "../../types"
import { notFound } from "../../types/errors"

const errorSchema = z.object({ error: z.string() })

const BUNDLE_VERSION = 1

async function buildFiles(): Promise<Record<string, string>> {
  const [{ providers, models }, mcpServers, personas] = await Promise.all([
    modelService.listEnabledWithProviders(),
    mcpServerService.list(),
    personaService.listEnabled()
  ])

  const files: Record<string, string> = {
    "models.toml": renderModelsToml(providers, models),
    "mcp.toml": renderMcpToml(mcpServers)
  }
  for (const persona of personas) {
    files[`personas/${persona.personaId}.toml`] = renderPersonaToml(persona)
  }
  return files
}

function etagFor(files: Record<string, string>): string {
  const hash = createHash("sha256")
  for (const key of Object.keys(files).sort()) {
    hash.update(key)
    hash.update(files[key]!)
  }
  return `"${hash.digest("hex")}"`
}

export const configExportRoutes = new OpenAPIHono<RouteProps>()

const exportBundleRoute = createRoute({
  method: "get",
  path: "/export",
  tags: ["Config"],
  summary: "Download the admin-managed defaults (personas, models, MCP servers) as a TOML bundle",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: configExportBundleSchema } } },
    304: { description: "Not modified" }
  }
})

configExportRoutes.openapi(exportBundleRoute, async c => {
  const files = await buildFiles()
  const etag = etagFor(files)
  c.header("Cache-Control", "public, max-age=300")
  c.header("ETag", etag)
  if (c.req.header("if-none-match") === etag) return c.body(null, 304)

  return c.json({ version: BUNDLE_VERSION, generatedAt: new Date(), files })
})

async function serveFile(c: Context<RouteProps>, file: string) {
  const files = await buildFiles()
  const content = files[file]
  if (content === undefined) return notFound(c, `Unknown export file "${file}"`)

  const etag = `"${createHash("sha256").update(content).digest("hex")}"`
  c.header("Cache-Control", "public, max-age=300")
  c.header("ETag", etag)
  if (c.req.header("if-none-match") === etag) return c.body(null, 304)

  return c.text(content, 200, { "Content-Type": "text/plain; charset=utf-8" })
}

const exportFileRoute = createRoute({
  method: "get",
  path: "/export/{file}",
  tags: ["Config"],
  summary: "Download a single top-level file from the admin-managed defaults bundle",
  request: {
    params: z.object({
      // Matches a single path segment only ("models.toml", "mcp.toml"); persona files live one
      // level deeper ("personas/care.toml") and are served by the wildcard route below instead.
      file: z.string().openapi({ param: { name: "file", in: "path" }, example: "models.toml" })
    })
  },
  responses: {
    200: { description: "OK", content: { "text/plain": { schema: z.string() } } },
    304: { description: "Not modified" },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } }
  }
})

configExportRoutes.openapi(exportFileRoute, c => serveFile(c, c.req.valid("param").file))

// Plain Hono route (not OpenAPI — createRoute's {param} can't match a nested path segment).
configExportRoutes.get("/export/personas/:id", c => serveFile(c, `personas/${c.req.param("id")}`))
