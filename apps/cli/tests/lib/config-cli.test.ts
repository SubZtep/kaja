import { afterEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import type { KajaConfig } from "../../schemas/config"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-config-cli`

const { runConfigCli } = await import("../../lib/config-cli")
const { getMcpPath } = await import("../../lib/mcp-servers")
const { getModelsPath } = await import("../../lib/models")

const baseConfig: KajaConfig = { llm: { baseUrl: "http://localhost", apiKey: "x", model: "x" } }

const originalFetch = globalThis.fetch

/** Stubs fetch for both mcp.toml and models.toml, keyed by request path. */
function stubFetch(bodies: Record<string, string>, status: number) {
  globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
    const path = new URL(url instanceof Request ? url.url : url).pathname
    return new Response(bodies[path] ?? "", { status })
  }) as typeof fetch
}

afterEach(async () => {
  globalThis.fetch = originalFetch
  const { $ } = await import("bun")
  await $`rm -f ${getMcpPath()} ${getMcpPath()}.bak ${getMcpPath()}.bak2 ${getModelsPath()} ${getModelsPath()}.bak ${getModelsPath()}.bak2`
    .quiet()
    .nothrow()
})

test("fetch without api.baseUrl configured exits 1", async () => {
  const { code, text } = await runConfigCli(["fetch"], baseConfig)
  expect(code).toBe(1)
  expect(text).toContain("api.baseUrl")
})

test("fetch writes mcp.toml and models.toml on success", async () => {
  stubFetch({ "/config/mcp.toml": '[[servers]]\nid = "x"\n', "/config/models.toml": '[[models]]\nid = "y"\n' }, 200)
  const config: KajaConfig = { ...baseConfig, api: { baseUrl: "http://api.test" } }
  const { code, text } = await runConfigCli(["fetch"], config)
  expect(code).toBe(0)
  expect(text).toContain(getMcpPath())
  expect(text).toContain(getModelsPath())
  expect(await Bun.file(getMcpPath()).text()).toContain('id = "x"')
  expect(await Bun.file(getModelsPath()).text()).toContain('id = "y"')
})

test("fetch backs up an existing mcp.toml instead of overwriting it", async () => {
  await Bun.write(getMcpPath(), "old content")
  stubFetch({ "/config/mcp.toml": "new content", "/config/models.toml": "models content" }, 200)
  const config: KajaConfig = { ...baseConfig, api: { baseUrl: "http://api.test" } }

  const first = await runConfigCli(["fetch"], config)
  expect(first.code).toBe(0)
  expect(first.text).toContain(".bak")
  expect(await Bun.file(`${getMcpPath()}.bak`).text()).toBe("old content")
  expect(await Bun.file(getMcpPath()).text()).toBe("new content")

  stubFetch({ "/config/mcp.toml": "newer content", "/config/models.toml": "models content" }, 200)
  const second = await runConfigCli(["fetch"], config)
  expect(second.code).toBe(0)
  expect(second.text).toContain(".bak2")
  expect(await Bun.file(`${getMcpPath()}.bak`).text()).toBe("old content")
  expect(await Bun.file(`${getMcpPath()}.bak2`).text()).toBe("new content")
  expect(await Bun.file(getMcpPath()).text()).toBe("newer content")
})

test("fetch surfaces a non-OK response as an error", async () => {
  stubFetch({ "/config/mcp.toml": "nope", "/config/models.toml": "nope" }, 500)
  const config: KajaConfig = { ...baseConfig, api: { baseUrl: "http://api.test" } }
  const { code, text } = await runConfigCli(["fetch"], config)
  expect(code).toBe(1)
  expect(text).toContain("500")
})

test("unknown or missing subcommand prints usage and exits 1", async () => {
  for (const argv of [[], ["nope"]]) {
    const { code, text } = await runConfigCli(argv, baseConfig)
    expect(code).toBe(1)
    expect(text).toContain("kaja config fetch")
  }
})
