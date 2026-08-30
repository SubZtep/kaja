import { afterEach, expect, test } from "bun:test"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { generateImageTool } from "../../src/tools/builtin/generate-image"
import { setToolDeps } from "../../src/tools/deps"

const originalFetch = globalThis.fetch
const tempDir = join(tmpdir(), `kaja-nasi-test-generate-image-${Date.now()}`)

afterEach(async () => {
  globalThis.fetch = originalFetch
  setToolDeps({})
  await rm(tempDir, { recursive: true, force: true })
})

test("no image-generation resolver configured: returns a not-configured message", async () => {
  setToolDeps({})
  const result = await generateImageTool.execute({ prompt: "a red fox" })
  expect(result).toBe("Image generation is not configured.")
})

test("resolver returning undefined for this persona: returns a not-configured message", async () => {
  setToolDeps({ imageGeneration: () => undefined, tempDir })
  const result = await generateImageTool.execute({ prompt: "a red fox" }, { owner: null, personaId: "researcher" })
  expect(result).toBe("Image generation is not configured.")
})

test("resolver's model for the given ctx.personaId is used to generate and download the image", async () => {
  let capturedModel: string | undefined
  let capturedAuth: string | null = null
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = url instanceof Request ? url.url : url.toString()
    if (href.includes("/images/generations")) {
      capturedAuth = new Headers(init?.headers).get("authorization")
      capturedModel = JSON.parse(String(init?.body)).model
      return new Response(JSON.stringify({ data: [{ url: "https://images.example.test/pic.png" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } })
  }) as unknown as typeof fetch

  let seenPersonaId: string | undefined
  setToolDeps({
    imageGeneration: personaId => {
      seenPersonaId = personaId
      return { model: "persona-image-model", baseUrl: "https://images.example.test/v1", apiKey: "image-key" }
    },
    tempDir
  })

  const result = await generateImageTool.execute({ prompt: "a red fox" }, { owner: null, personaId: "researcher" })

  expect(seenPersonaId).toBe("researcher")
  expect(capturedModel).toBe("persona-image-model")
  expect(capturedAuth as string | null).toBe("Bearer image-key")
  expect(result).toEqual({
    text: "Generated image: a red fox",
    images: [{ path: expect.stringContaining(tempDir), mimeType: "image/png" }]
  })
})
