import { afterEach, beforeAll, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

process.env.XDG_DATA_HOME = `${tmpdir()}/kaja-test-xdg-data-sounds`

const { syncSounds } = await import("../../../lib/audio/sounds")
const { getSoundsDir } = await import("../../../lib/paths")

const originalFetch = globalThis.fetch
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

const bell = new TextEncoder().encode("bell bytes")
const wind = new TextEncoder().encode("wind bytes")
const served: Record<string, Uint8Array> = { "bell.wav": bell, "wind.wav": wind }
let requests: string[] = []

function serve(overrides: Record<string, Uint8Array> = {}) {
  const files = { ...served, ...overrides }
  globalThis.fetch = (async (input: Request | URL | string) => {
    const path = new URL(input instanceof Request ? input.url : input).pathname
    requests.push(path)
    if (path === "/config/sounds") {
      return Response.json({
        files: Object.entries(served).map(([name, bytes]) => ({ name, size: bytes.length, sha256: sha(bytes) }))
      })
    }
    const bytes = files[path.replace("/config/sounds/", "")]
    return bytes ? new Response(Buffer.from(bytes)) : new Response("nope", { status: 404 })
  }) as unknown as typeof fetch
}

beforeAll(() => rm(getSoundsDir(), { recursive: true, force: true }))

afterEach(() => {
  globalThis.fetch = originalFetch
  requests = []
})

test("downloads every sound, then only what is missing or changed", async () => {
  serve()
  expect(await syncSounds()).toBe(true)
  expect(await Bun.file(join(getSoundsDir(), "bell.wav")).text()).toBe("bell bytes")
  expect(requests).toEqual(["/config/sounds", "/config/sounds/bell.wav", "/config/sounds/wind.wav"])

  requests = []
  expect(await syncSounds()).toBe(true)
  expect(requests).toEqual(["/config/sounds"])

  await Bun.write(join(getSoundsDir(), "wind.wav"), "tampered")
  requests = []
  expect(await syncSounds()).toBe(true)
  expect(requests).toEqual(["/config/sounds", "/config/sounds/wind.wav"])
  expect(await Bun.file(join(getSoundsDir(), "wind.wav")).text()).toBe("wind bytes")
})

test("a download that does not match the manifest is refused and never left in the folder", async () => {
  await rm(getSoundsDir(), { recursive: true, force: true })
  await mkdir(getSoundsDir(), { recursive: true })
  serve({ "bell.wav": new TextEncoder().encode("corrupted!") })
  expect(await syncSounds()).toBe(false)
  expect(await Bun.file(join(getSoundsDir(), "bell.wav")).exists()).toBe(false)
})

test("an unreachable server is reported as not synced, not thrown", async () => {
  globalThis.fetch = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch
  expect(await syncSounds()).toBe(false)
})
