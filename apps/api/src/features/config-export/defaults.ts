import { createHash } from "node:crypto"
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi"
import { configCatalogSchema } from "@kaja/schema/api"
import type { Context } from "hono"
import { catalogBundle, defaultSchemas, defaultTemplates } from "../../services/config-defaults"
import type { RouteProps } from "../../types"
import { notFound } from "../../types/errors"

const errorSchema = z.object({ error: z.string() })

const etagOf = (text: string) => `"${createHash("sha256").update(text).digest("hex")}"`

const catalogEtag = etagOf(JSON.stringify(catalogBundle))
const schemaEtags = new Map([...defaultSchemas].map(([file, schema]) => [file, etagOf(JSON.stringify(schema))]))

// Same caching as /config/export: the content only changes with a deploy.
function notModified(c: Context<RouteProps>, etag: string): boolean {
  c.header("Cache-Control", "public, max-age=300")
  c.header("ETag", etag)
  return c.req.header("if-none-match") === etag
}

const catalogRoute = createRoute({
  method: "get",
  path: "/catalog",
  tags: ["Config"],
  summary: "The model catalog the setup wizard builds models.toml from",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: configCatalogSchema } } },
    304: { description: "Not modified" }
  }
})

const templateRoute = createRoute({
  method: "get",
  path: "/templates/{file}",
  tags: ["Config"],
  summary: "A default config file (commands, hooks, model examples) as TOML text",
  request: {
    params: z.object({
      file: z.string().openapi({ param: { name: "file", in: "path" }, example: "models.default.toml" })
    })
  },
  responses: {
    200: { description: "OK", content: { "text/plain": { schema: z.string() } } },
    304: { description: "Not modified" },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } }
  }
})

const schemaRoute = createRoute({
  method: "get",
  path: "/schemas/{file}",
  tags: ["Config"],
  summary: "A JSON Schema for one of the TOML config files, for editors (Tombi, taplo)",
  request: {
    params: z.object({
      file: z.string().openapi({ param: { name: "file", in: "path" }, example: "models.json" })
    })
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: z.record(z.string(), z.unknown()) } } },
    304: { description: "Not modified" },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } }
  }
})

/** Public, unauthenticated: the same defaults the CLI bundles, so it carries no keys. */
export function registerConfigDefaults(routes: OpenAPIHono<RouteProps>) {
  routes.openapi(catalogRoute, c => {
    if (notModified(c, catalogEtag)) return c.body(null, 304)
    return c.json(catalogBundle, 200)
  })

  routes.openapi(templateRoute, c => {
    const { file } = c.req.valid("param")
    const content = defaultTemplates.get(file)
    if (content === undefined) return notFound(c, `Unknown template "${file}"`)

    if (notModified(c, etagOf(content))) return c.body(null, 304)
    return c.text(content, 200, { "Content-Type": "text/plain; charset=utf-8" })
  })

  routes.openapi(schemaRoute, c => {
    const { file } = c.req.valid("param")
    const schema = defaultSchemas.get(file)
    if (schema === undefined) return notFound(c, `Unknown schema "${file}"`)

    if (notModified(c, schemaEtags.get(file)!)) return c.body(null, 304)
    return c.json(schema as Record<string, unknown>, 200)
  })
}
