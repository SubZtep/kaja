import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { publicCatalogSchema } from "@kaja/schema/api"
import { app } from "../../src/app"
import { sql } from "../../src/core/db"
import { catalogService } from "../../src/services"
import { CatalogService } from "../../src/services/catalog"
import { signUpAndSignIn } from "./helpers"

const tag = faker.string.alphanumeric(6).toLowerCase()
const slug = `acme-${tag}`
const adminEmail = `admin-catalog-${tag}@example.com`
const userEmail = `user-catalog-${tag}@example.com`

let adminToken: string
let userToken: string

// A models.dev payload with one provider: a chat model that sees, an embedder, and a video model Kaja can't use.
function payload(models: Record<string, unknown> = baseModels()) {
  return { [slug]: { id: slug, name: "Acme AI", api: "https://api.acme.test/v1/", doc: "https://acme.test", models } }
}

function baseModels(): Record<string, unknown> {
  return {
    "acme-chat": {
      id: "acme-chat",
      name: "Acme Chat",
      modalities: { input: ["text", "image"], output: ["text"] },
      limit: { context: 128000 }
    },
    "acme-embed": { id: "acme-embed", name: "Acme Embed", type: "embedding" },
    "acme-video": { id: "acme-video", type: "video" }
  }
}

const admin = (path: string, init: { method?: string; body?: string } = {}, token = adminToken) =>
  app.request(`/admin${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  })

async function providerId(): Promise<string> {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM catalog_provider WHERE slug = ${slug}`
  return row!.id
}

async function modelId(model: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    SELECT m.id FROM catalog_model m JOIN catalog_provider p ON p.id = m.provider_id
    WHERE p.slug = ${slug} AND m.model = ${model}`
  return row!.id
}

async function publicProvider() {
  const body = publicCatalogSchema.parse(await (await app.request("/config/catalog")).json())
  return body.providers.find(provider => provider.id === slug)
}

beforeAll(async () => {
  adminToken = await signUpAndSignIn(adminEmail, "Catalog Admin")
  userToken = await signUpAndSignIn(userEmail, "Catalog User")
  await sql`UPDATE "user" SET role = 'admin' WHERE email = ${adminEmail}`
})

afterAll(async () => {
  await sql`DELETE FROM catalog_provider WHERE slug LIKE ${`%${tag}`}`
  await sql`DELETE FROM "user" WHERE email = ANY(${[adminEmail, userEmail]})`
})

describe("catalog", () => {
  test("the admin routes are for admins only", async () => {
    expect((await app.request("/admin/catalog/providers")).status).toBe(401)
    expect((await admin("/catalog/providers", {}, userToken)).status).toBe(403)
  })

  test("a sync adds models.dev's provider unlisted, with the models Kaja has a task for", async () => {
    const result = await catalogService.applyModelsDev(payload())
    expect(result.providers.added).toBeGreaterThanOrEqual(1)

    const models = await catalogService.listModels(await providerId())
    expect(models.map(model => [model.model, model.tasks, model.images, model.contextWindow])).toEqual([
      ["acme-chat", ["chat", "summarize", "vision"], true, 128000],
      ["acme-embed", ["embedding"], false, null]
    ])
    const [row] = await sql`SELECT listed, api_url FROM catalog_provider WHERE slug = ${slug}`
    expect(row).toEqual({ listed: false, api_url: "https://api.acme.test/v1" })
    expect(await publicProvider()).toBeUndefined()
  })

  test("listing a provider and picking defaults puts it in /config/catalog, with a new ETag", async () => {
    const before = (await app.request("/config/catalog")).headers.get("etag")
    const listed = await admin(`/catalog/providers/${await providerId()}`, {
      method: "PATCH",
      body: JSON.stringify({ listed: true, note: "Fast and cheap" })
    })
    expect(listed.status).toBe(200)

    const chat = await admin(`/catalog/models/${await modelId("acme-chat")}`, {
      method: "PATCH",
      body: JSON.stringify({ defaultTasks: ["chat", "vision"] })
    })
    expect(chat.status).toBe(200)

    const one = await (await admin(`/catalog/providers/${await providerId()}`)).json()
    expect(one).toMatchObject({ slug, listed: true, modelCount: 2, defaultTasks: ["chat", "vision"] })

    const provider = await publicProvider()
    expect(provider).toMatchObject({ kind: "hosted", base_url: "https://api.acme.test/v1", note: "Fast and cheap" })
    expect(provider!.models[0]).toMatchObject({ model: "acme-chat", default_tasks: ["chat", "vision"] })
    expect((await app.request("/config/catalog")).headers.get("etag")).not.toBe(before)
  })

  test("a default must be one of the model's tasks, and one model per task holds it", async () => {
    const embed = await modelId("acme-embed")
    const bad = await admin(`/catalog/models/${embed}`, {
      method: "PATCH",
      body: JSON.stringify({ defaultTasks: ["chat"] })
    })
    expect(bad.status).toBe(400)

    // Taking chat for the embedder (after giving it the task) takes it off acme-chat.
    await admin(`/catalog/models/${embed}`, {
      method: "PATCH",
      body: JSON.stringify({ tasks: ["embedding", "chat"], defaultTasks: ["chat"] })
    })
    const models = await catalogService.listModels(await providerId())
    expect(models.find(model => model.model === "acme-chat")!.defaultTasks).toEqual(["vision"])
    expect(models.find(model => model.model === "acme-embed")).toMatchObject({
      tasksEdited: true,
      defaultTasks: ["chat"]
    })
  })

  test("a re-sync keeps the admin's choices and admin-added models, and marks dropped models removed", async () => {
    const id = await providerId()
    const added = await admin(`/catalog/providers/${id}/models`, {
      method: "POST",
      body: JSON.stringify({ model: "acme-rerank", tasks: ["rerank"] })
    })
    expect(added.status).toBe(201)
    await admin(`/catalog/providers/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ baseUrl: "https://eu.acme.test/v1" })
    })

    // models.dev renames the chat model, drops the embedder and calls the chat model text-only.
    const result = await catalogService.applyModelsDev(
      payload({
        "acme-chat": { id: "acme-chat", name: "Acme Chat 2", modalities: { input: ["text"], output: ["text"] } }
      })
    )
    expect(result.models.removed).toBeGreaterThanOrEqual(1)

    const models = await catalogService.listModels(id)
    const byName = new Map(models.map(model => [model.model, model]))
    expect(byName.get("acme-chat")).toMatchObject({ name: "Acme Chat 2", tasks: ["chat", "summarize"] })
    // Its edited tasks and its default survive, though it's gone from models.dev
    expect(byName.get("acme-embed")).toMatchObject({
      status: "removed",
      tasks: ["embedding", "chat"],
      defaultTasks: ["chat"]
    })
    expect(byName.get("acme-rerank")).toMatchObject({ source: "admin", status: null })

    const provider = await publicProvider()
    expect(provider).toMatchObject({ base_url: "https://eu.acme.test/v1", note: "Fast and cheap" })
    // A removed model stays served only while it is a default
    expect(provider!.models.map(model => model.model).sort()).toEqual(["acme-chat", "acme-embed", "acme-rerank"])
  })

  test("an admin-added provider needs a free slug", async () => {
    const body = { slug: `local-${tag}`, name: "Local", kind: "self-hosted", baseUrl: "http://localhost:8080/v1" }
    const created = await admin("/catalog/providers", { method: "POST", body: JSON.stringify(body) })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ source: "admin", kind: "self-hosted", listed: false })
    expect((await admin("/catalog/providers", { method: "POST", body: JSON.stringify(body) })).status).toBe(409)
  })
})

describe("catalog sync", () => {
  test("sends the stored ETag, skips on a 304, and records a failure", async () => {
    const seen: (string | null)[] = []
    let answer: () => Response = () => new Response(JSON.stringify(payload()), { headers: { ETag: `"v1-${tag}"` } })
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("if-none-match"))
      return answer()
    }) as unknown as typeof fetch
    const service = new CatalogService(sql, fakeFetch, "https://models.dev.test/api.json")

    expect((await service.sync({ force: true })).changed).toBe(true)
    answer = () => new Response(null, { status: 304 })
    expect((await service.sync()).changed).toBe(false)
    expect(seen).toEqual([null, `"v1-${tag}"`])

    answer = () => new Response("nope", { status: 500 })
    await expect(service.sync()).rejects.toThrow("500")
    expect((await service.syncStatus()).error).toContain("500")
  })
})
