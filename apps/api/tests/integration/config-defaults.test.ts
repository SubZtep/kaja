import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { configCatalogSchema } from "@kaja/schema/api"
import { CATALOG_VERSION, ModelsFileSchema } from "@kaja/schema/config"
import { TOML } from "bun"
import { app } from "../../src/app"

describe("config defaults (public)", () => {
  test("GET /config/catalog requires no auth and returns the versioned catalog", async () => {
    const res = await app.request("/config/catalog")
    expect(res.status).toBe(200)
    const body = configCatalogSchema.parse(await res.json())
    expect(body.version).toBe(CATALOG_VERSION)
    expect(body.catalog.providers.length).toBeGreaterThan(0)
  })

  test("GET /config/catalog honours If-None-Match with a 304", async () => {
    const etag = (await app.request("/config/catalog")).headers.get("etag")
    expect(etag).not.toBeNull()
    const res = await app.request("/config/catalog", { headers: { "If-None-Match": etag! } })
    expect(res.status).toBe(304)
  })

  test("GET /config/templates/<file> returns plain TOML", async () => {
    const res = await app.request("/config/templates/models.default.toml")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/plain")
    expect(ModelsFileSchema.safeParse(TOML.parse(await res.text())).success).toBe(true)
  })

  test("GET /config/templates/<file> honours If-None-Match with a 304", async () => {
    const etag = (await app.request("/config/templates/commands.toml")).headers.get("etag")
    const res = await app.request("/config/templates/commands.toml", { headers: { "If-None-Match": etag! } })
    expect(res.status).toBe(304)
  })

  test.each(["secrets.toml", "settings.toml", "catalog.toml", "constructor", "does-not-exist.toml"])(
    "GET /config/templates/%s is 404",
    async file => {
      expect((await app.request(`/config/templates/${file}`)).status).toBe(404)
    }
  )

  test("GET /config/schemas/<file> returns the JSON Schema, the one committed in config/schemas", async () => {
    const res = await app.request("/config/schemas/models.json")
    expect(res.status).toBe(200)
    const committed = await Bun.file(join(import.meta.dir, "../../../../config/schemas/models.json")).json()
    expect(await res.json()).toEqual(committed)
  })

  test("GET /config/schemas/<file> honours If-None-Match with a 304", async () => {
    const etag = (await app.request("/config/schemas/settings.json")).headers.get("etag")
    const res = await app.request("/config/schemas/settings.json", { headers: { "If-None-Match": etag! } })
    expect(res.status).toBe(304)
  })

  test.each(["constructor", "models", "does-not-exist.json"])("GET /config/schemas/%s is 404", async file => {
    expect((await app.request(`/config/schemas/${file}`)).status).toBe(404)
  })
})
