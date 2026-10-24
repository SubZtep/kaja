import { createHash } from "node:crypto"
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi"
import { SoundsManifestSchema } from "@kaja/schema/config"
import type { Context } from "hono"
import { defaultSchemas } from "../../services/config-defaults"
import { soundFile, sounds } from "../../services/sounds"
import type { RouteProps } from "../../types"
import { notFound } from "../../types/errors"

const errorSchema = z.object({ error: z.string() })

const etagOf = (text: string) => `"${createHash("sha256").update(text).digest("hex")}"`

const schemaEtags = new Map([...defaultSchemas].map(([file, schema]) => [file, etagOf(JSON.stringify(schema))]))

// The content only changes with a deploy.
function notModified(c: Context<RouteProps>, etag: string): boolean {
  c.header("Cache-Control", "public, max-age=300")
  c.header("ETag", etag)
  return c.req.header("if-none-match") === etag
}

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

const soundsRoute = createRoute({
  method: "get",
  path: "/sounds",
  tags: ["Config"],
  summary: "The sound effects hooks.toml can play: names, sizes and hashes, for the terminal to download what it lacks",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: SoundsManifestSchema } } },
    304: { description: "Not modified" }
  }
})

/** Public, unauthenticated: nothing here carries a key. */
export function registerConfigDefaults(routes: OpenAPIHono<RouteProps>) {
  routes.openapi(soundsRoute, async c => {
    const { manifest } = await sounds()
    if (notModified(c, etagOf(JSON.stringify(manifest)))) return c.body(null, 304)
    return c.json(manifest, 200)
  })

  // A plain route: the body is a file, which the OpenAPI response typing can't express
  routes.get("/sounds/:file", async c => {
    const name = c.req.param("file")
    const file = await soundFile(name)
    if (!file) return notFound(c, `Unknown sound "${name}"`)

    const etag = etagOf(`${file.size}:${file.lastModified}`)
    if (notModified(c, etag)) return c.body(null, 304)
    return new Response(file, {
      headers: { "Content-Type": file.type, "Cache-Control": "public, max-age=300", ETag: etag }
    })
  })

  routes.openapi(schemaRoute, c => {
    const { file } = c.req.valid("param")
    const schema = defaultSchemas.get(file)
    if (schema === undefined) return notFound(c, `Unknown schema "${file}"`)

    if (notModified(c, schemaEtags.get(file)!)) return c.body(null, 304)
    return c.json(schema as Record<string, unknown>, 200)
  })
}
