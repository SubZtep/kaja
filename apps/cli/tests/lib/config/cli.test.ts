import { afterEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import type { ServicesFile } from "@kaja/schema/config"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-config-cli`

const { runConfigCli } = await import("../../../lib/config/cli")
const { getConfigDir, getConfigPath, readConfigLoose } = await import("../../../lib/config/config")
const { getMcpPath } = await import("../../../lib/config/mcp-servers")
const { getModelsPath } = await import("../../../lib/models/models")
const { getServicesPath } = await import("../../../lib/config/services")

const originalFetch = globalThis.fetch

/** Stubs fetch for both mcp.toml and models.toml, keyed by request path. */
function stubFetch(bodies: Record<string, string>, status: number) {
  globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
    const path = new URL(url instanceof Request ? url.url : url).pathname
    return new Response(bodies[path] ?? "", { status })
  }) as typeof fetch
}

/** Like stubFetch, but records Authorization headers from each request. */
function stubFetchCaptureAuth(bodies: Record<string, string>, status: number) {
  const authHeaders: (string | null)[] = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(url instanceof Request ? url.url : url).pathname
    const headers = new Headers(init?.headers)
    authHeaders.push(headers.get("authorization"))
    return new Response(bodies[path] ?? "", { status })
  }) as typeof fetch
  return authHeaders
}

afterEach(async () => {
  globalThis.fetch = originalFetch
  const { $ } = await import("bun")
  await $`rm -f ${getMcpPath()} ${getMcpPath()}.bak ${getMcpPath()}.bak2 ${getModelsPath()} ${getModelsPath()}.bak ${getModelsPath()}.bak2 ${getConfigPath()} ${getServicesPath()}`
    .quiet()
    .nothrow()
  await $`rm -rf ${getConfigDir()} ${getConfigDir()}.bak ${getConfigDir()}.bak2`.quiet().nothrow()
})

test("fetch without api.baseUrl configured exits 1", async () => {
  const { code, text } = await runConfigCli(["fetch"], {})
  expect(code).toBe(1)
  expect(text).toContain("baseUrl")
})

test("fetch sends Bearer token from services.api.token", async () => {
  const authHeaders = stubFetchCaptureAuth(
    { "/config/mcp.toml": '[[servers]]\nid = "x"\n', "/config/models.toml": '[[models]]\nid = "y"\n' },
    200
  )
  const services: Partial<ServicesFile> = {
    api: { baseUrl: "http://api.test", token: "shared-secret" }
  }
  const { code } = await runConfigCli(["fetch"], services)
  expect(code).toBe(0)
  expect(authHeaders).toHaveLength(2)
  expect(authHeaders.every(h => h === "Bearer shared-secret")).toBe(true)
})

test("fetch writes mcp.toml and models.toml on success", async () => {
  stubFetch({ "/config/mcp.toml": '[[servers]]\nid = "x"\n', "/config/models.toml": '[[models]]\nid = "y"\n' }, 200)
  const services: Partial<ServicesFile> = { api: { baseUrl: "http://api.test" } }
  const { code, text } = await runConfigCli(["fetch"], services)
  expect(code).toBe(0)
  expect(text).toContain(getMcpPath())
  expect(text).toContain(getModelsPath())
  expect(await Bun.file(getMcpPath()).text()).toContain('id = "x"')
  expect(await Bun.file(getModelsPath()).text()).toContain('id = "y"')
})

test("fetch backs up an existing mcp.toml instead of overwriting it", async () => {
  await Bun.write(getMcpPath(), "old content")
  stubFetch({ "/config/mcp.toml": "new content", "/config/models.toml": "models content" }, 200)
  const services: Partial<ServicesFile> = { api: { baseUrl: "http://api.test" } }

  const first = await runConfigCli(["fetch"], services)
  expect(first.code).toBe(0)
  expect(first.text).toContain(".bak")
  expect(await Bun.file(`${getMcpPath()}.bak`).text()).toBe("old content")
  expect(await Bun.file(getMcpPath()).text()).toBe("new content")

  stubFetch({ "/config/mcp.toml": "newer content", "/config/models.toml": "models content" }, 200)
  const second = await runConfigCli(["fetch"], services)
  expect(second.code).toBe(0)
  expect(second.text).toContain(".bak2")
  expect(await Bun.file(`${getMcpPath()}.bak`).text()).toBe("old content")
  expect(await Bun.file(`${getMcpPath()}.bak2`).text()).toBe("new content")
  expect(await Bun.file(getMcpPath()).text()).toBe("newer content")
})

test("fetch surfaces a non-OK response as an error", async () => {
  stubFetch({ "/config/mcp.toml": "nope", "/config/models.toml": "nope" }, 500)
  const services: Partial<ServicesFile> = { api: { baseUrl: "http://api.test" } }
  const { code, text } = await runConfigCli(["fetch"], services)
  expect(code).toBe(1)
  expect(text).toContain("500")
})

test("wipe backs up the whole config dir to .bak", async () => {
  await Bun.write(getConfigPath(), 'hello = "world"\n')
  const { code, text } = await runConfigCli(["wipe"], {})
  expect(code).toBe(0)
  expect(text).toContain(`${getConfigDir()}.bak`)
  expect(await Bun.file(getConfigPath()).exists()).toBe(false)
  expect(await Bun.file(`${getConfigDir()}.bak/settings.toml`).text()).toContain("world")
})

test("a second wipe uses .bak2", async () => {
  await Bun.write(getConfigPath(), "run = 1\n")
  await runConfigCli(["wipe"], {})
  await Bun.write(getConfigPath(), "run = 2\n")
  const { code, text } = await runConfigCli(["wipe"], {})
  expect(code).toBe(0)
  expect(text).toContain(`${getConfigDir()}.bak2`)
  expect(await Bun.file(`${getConfigDir()}.bak/settings.toml`).text()).toContain("run = 1")
  expect(await Bun.file(`${getConfigDir()}.bak2/settings.toml`).text()).toContain("run = 2")
})

test("wipe with no existing config dir is a no-op", async () => {
  const { code, text } = await runConfigCli(["wipe"], {})
  expect(code).toBe(0)
  expect(text).toContain(getConfigDir())
})

test("unknown or missing subcommand prints usage and exits 1", async () => {
  for (const argv of [[], ["nope"]]) {
    const { code, text } = await runConfigCli(argv, {})
    expect(code).toBe(1)
    expect(text).toContain("kaja config fetch")
  }
})

test("a fresh install's models.chat is auto-filled from the first fetched chat model", async () => {
  // No settings.toml on disk yet — same as right after a fresh `create()`.
  const modelsToml = `
[providers.default]
default = true
base_url = "https://api.example.test/v1"
api_key = "key"

[[models]]
id = "embedding-default"
model = "some/embedder"
task = "embedding"

[[models]]
id = "chat-real"
model = "some/chat-model"
task = "chat"
`
  stubFetch({ "/config/mcp.toml": "[[servers]]\n", "/config/models.toml": modelsToml }, 200)
  const { code } = await runConfigCli(["fetch"], { api: { baseUrl: "http://api.test" } })
  expect(code).toBe(0)
  const saved = await readConfigLoose()
  expect(saved.models?.chat).toEqual({ model: "some/chat-model", provider: "default" })
})

test("an existing real models.chat on disk is not overwritten by a later fetch", async () => {
  await Bun.write(
    getConfigPath(),
    `
[models.chat]
model = "my-real-chat-model"
provider = "default"
`
  )

  const modelsToml = `
[providers.default]
base_url = "https://api.example.test/v1"
api_key = "key"

[[models]]
id = "chat-other"
model = "some/other-chat-model"
task = "chat"
`
  stubFetch({ "/config/mcp.toml": "[[servers]]\n", "/config/models.toml": modelsToml }, 200)
  const { code } = await runConfigCli(["fetch"], { api: { baseUrl: "http://api.test" } })
  expect(code).toBe(0)
  const saved = await readConfigLoose()
  expect(saved.models?.chat).toEqual({ model: "my-real-chat-model", provider: "default" })
})
