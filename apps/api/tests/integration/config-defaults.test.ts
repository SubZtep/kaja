import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { PUBLIC_CATALOG_VERSION, publicCatalogSchema } from "@kaja/schema/api"
import { ModelsFileSchema, SoundsManifestSchema } from "@kaja/schema/config"
import { tombiSchemas } from "@kaja/schema/tombi"
import { TOML } from "bun"
import { app } from "../../src/app"

describe("config defaults (public)", () => {
  test("GET /config/catalog requires no auth and returns the versioned catalog", async () => {
    const res = await app.request("/config/catalog")
    expect(res.status).toBe(200)
    expect(publicCatalogSchema.parse(await res.json()).version).toBe(PUBLIC_CATALOG_VERSION)
  })

  test.each(["/config/catalog", "/config/templates/commands.toml", "/config/schemas/settings.json", "/config/sounds"])(
    "GET %s honours If-None-Match with a 304",
    async path => {
      const etag = (await app.request(path)).headers.get("etag")
      expect(etag).not.toBeNull()
      const res = await app.request(path, { headers: { "If-None-Match": etag! } })
      expect(res.status).toBe(304)
    }
  )

  test("GET /config/templates/<file> returns plain TOML", async () => {
    const res = await app.request("/config/templates/models.default.toml")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/plain")
    expect(ModelsFileSchema.safeParse(TOML.parse(await res.text())).success).toBe(true)
  })

  test.each(["secrets.toml", "settings.toml", "catalog.toml", "constructor", "does-not-exist.toml"])(
    "GET /config/templates/%s is 404",
    async file => {
      expect((await app.request(`/config/templates/${file}`)).status).toBe(404)
    }
  )

  test.each(Object.keys(tombiSchemas))(
    "GET /config/schemas/%s matches the committed packages/schema/json copy",
    async file => {
      const res = await app.request(`/config/schemas/${file}`)
      expect(res.status).toBe(200)
      const committed = await Bun.file(join(import.meta.dir, "../../../../packages/schema/json", file)).json()
      expect(await res.json()).toEqual(committed)
    }
  )

  test.each(["constructor", "models", "does-not-exist.json"])("GET /config/schemas/%s is 404", async file => {
    expect((await app.request(`/config/schemas/${file}`)).status).toBe(404)
  })

  test("GET /config/sounds lists every sound with the hash of the file it serves", async () => {
    const res = await app.request("/config/sounds")
    expect(res.status).toBe(200)
    const { files } = SoundsManifestSchema.parse(await res.json())
    expect(files.map(file => file.name)).toContain("bell.wav")

    const bell = files.find(file => file.name === "bell.wav")!
    const file = await app.request("/config/sounds/bell.wav")
    expect(file.status).toBe(200)
    expect(file.headers.get("content-type")).toContain("audio")
    const bytes = new Uint8Array(await file.arrayBuffer())
    expect(bytes.byteLength).toBe(bell.size)
    expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(bell.sha256)
  })

  test.each(["constructor", "../package.json", "does-not-exist.wav"])("GET /config/sounds/%s is 404", async file => {
    expect((await app.request(`/config/sounds/${encodeURIComponent(file)}`)).status).toBe(404)
  })
})
