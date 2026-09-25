import { afterEach, expect, test } from "bun:test"
import { fetchUrlTool } from "../../src/tools/builtin/fetch-url"
import { getToolDeps, setToolDeps } from "../../src/tools/deps"

// A public-looking URL through a proxy pointed at a local Bun.serve, as in ssrf-size.test.ts
const PUBLIC_URL = "http://172.32.0.1/cat.jpg"
const saved = getToolDeps()

afterEach(() => setToolDeps(saved))

async function fetchFrom(response: Response) {
  const origin = Bun.serve({ port: 0, fetch: () => response })
  setToolDeps({ ...saved, fetchProxy: `http://127.0.0.1:${origin.port}` })
  try {
    return await fetchUrlTool.execute({ url: PUBLIC_URL })
  } finally {
    await origin.stop(true)
  }
}

test("an image isn't returned as text, and the note says how to show it", async () => {
  const result = await fetchFrom(
    new Response(new Uint8Array([0xff, 0xd8, 0x00, 0x00]), { headers: { "content-type": "image/jpeg" } })
  )
  expect(result).not.toContain("\0")
  expect(result).toContain(`![description](${PUBLIC_URL})`)
})

test("plain text comes back as is", async () => {
  const result = await fetchFrom(new Response("hello", { headers: { "content-type": "text/plain; charset=utf-8" } }))
  expect(result).toBe("hello")
})
