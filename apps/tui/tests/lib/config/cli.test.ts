import { afterEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-config-cli`

const { runConfigCli } = await import("../../../lib/config/cli")
const { getConfigDir, getConfigPath } = await import("../../../lib/config/config")
const { getMcpPath } = await import("../../../lib/config/mcp-servers")
const { getModelsPath } = await import("../../../lib/models/models")
const { getPersonasDir } = await import("../../../lib/personas/personas")
const { getPaths } = await import("../../../lib/paths")
const { join } = await import("node:path")

afterEach(async () => {
  const { $ } = await import("bun")
  await $`rm -f ${getMcpPath()} ${getMcpPath()}.bak ${getMcpPath()}.bak2 ${getModelsPath()} ${getModelsPath()}.bak ${getModelsPath()}.bak2 ${getConfigPath()}`
    .quiet()
    .nothrow()
  await $`rm -rf ${getConfigDir()} ${getConfigDir()}.bak ${getConfigDir()}.bak2`.quiet().nothrow()
  // fetchRemoteConfigBundle() caches the last seen ETag outside the config dir — clear it so tests don't leak a 304 into each other.
  await $`rm -f ${join(getPaths().temp, "kaja-config-fetch-etag")}`.quiet().nothrow()
})

test("fetch writes mcp.toml, models.toml and persona files from the bundled templates", async () => {
  const { code, text } = await runConfigCli(["fetch"])
  expect(code).toBe(0)
  expect(text).toContain(getMcpPath())
  expect(text).toContain(getModelsPath())
  expect(text).toContain(`${getPersonasDir()}/default.toml`)
  expect(await Bun.file(getMcpPath()).exists()).toBe(true)
  expect(await Bun.file(getModelsPath()).exists()).toBe(true)
  expect(await Bun.file(`${getPersonasDir()}/barkochba.toml`).exists()).toBe(true)
})

test("fetch backs up an existing mcp.toml instead of overwriting it", async () => {
  await Bun.write(getMcpPath(), "old content")

  const first = await runConfigCli(["fetch"])
  expect(first.code).toBe(0)
  expect(first.text).toContain(".bak")
  expect(await Bun.file(`${getMcpPath()}.bak`).text()).toBe("old content")
  expect(await Bun.file(getMcpPath()).text()).not.toBe("old content")

  await Bun.write(getMcpPath(), "newer content")
  const second = await runConfigCli(["fetch"])
  expect(second.code).toBe(0)
  expect(second.text).toContain(".bak2")
  expect(await Bun.file(`${getMcpPath()}.bak`).text()).toBe("old content")
  expect(await Bun.file(`${getMcpPath()}.bak2`).text()).toBe("newer content")
})

test("fetch is a no-op (no new backup) when the file already matches the bundled template", async () => {
  const { code: firstCode } = await runConfigCli(["fetch"])
  expect(firstCode).toBe(0)

  const { code, text } = await runConfigCli(["fetch"])
  expect(code).toBe(0)
  expect(text).not.toContain(".bak")
  expect(await Bun.file(`${getMcpPath()}.bak`).exists()).toBe(false)
})

test("wipe backs up the whole config dir to .bak", async () => {
  await Bun.write(getConfigPath(), 'hello = "world"\n')
  const { code, text } = await runConfigCli(["wipe"])
  expect(code).toBe(0)
  expect(text).toContain(`${getConfigDir()}.bak`)
  expect(await Bun.file(getConfigPath()).exists()).toBe(false)
  expect(await Bun.file(`${getConfigDir()}.bak/settings.toml`).text()).toContain("world")
})

test("a second wipe uses .bak2", async () => {
  await Bun.write(getConfigPath(), "run = 1\n")
  await runConfigCli(["wipe"])
  await Bun.write(getConfigPath(), "run = 2\n")
  const { code, text } = await runConfigCli(["wipe"])
  expect(code).toBe(0)
  expect(text).toContain(`${getConfigDir()}.bak2`)
  expect(await Bun.file(`${getConfigDir()}.bak/settings.toml`).text()).toContain("run = 1")
  expect(await Bun.file(`${getConfigDir()}.bak2/settings.toml`).text()).toContain("run = 2")
})

test("wipe with no existing config dir is a no-op", async () => {
  const { code, text } = await runConfigCli(["wipe"])
  expect(code).toBe(0)
  expect(text).toContain(getConfigDir())
})

test("unknown or missing subcommand prints usage and exits 1", async () => {
  for (const argv of [[], ["nope"]]) {
    const { code, text } = await runConfigCli(argv)
    expect(code).toBe(1)
    expect(text).toContain("kaja config fetch")
  }
})

function mockBundleFetch(files: Record<string, string>, etag = '"abc123"') {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(String(input))
    expect(url.pathname).toBe("/config/export")
    const ifNoneMatch = new Headers(init?.headers).get("if-none-match")
    if (ifNoneMatch === etag) return new Response(null, { status: 304 })
    return new Response(JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), files }), {
      status: 200,
      headers: { etag, "content-type": "application/json" }
    })
  }) as typeof fetch
  return () => {
    globalThis.fetch = originalFetch
  }
}

test("fetch downloads the bundle from the server when reachable", async () => {
  const restore = mockBundleFetch({
    "models.toml": 'label = "from-server"\n',
    "mcp.toml": "servers = []\n",
    "personas/default.toml": 'label = "server persona"\n'
  })
  try {
    const { code, text } = await runConfigCli(["fetch"])
    expect(code).toBe(0)
    expect(text).toContain(getModelsPath())
    expect(await Bun.file(getModelsPath()).text()).toContain("from-server")
    expect(await Bun.file(`${getPersonasDir()}/default.toml`).text()).toContain("server persona")
  } finally {
    restore()
  }
})

test("fetch with --offline never touches the network", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    throw new Error("network should not be used with --offline")
  }) as unknown as typeof fetch
  try {
    const { code } = await runConfigCli(["fetch", "--offline"])
    expect(code).toBe(0)
    expect(await Bun.file(getModelsPath()).exists()).toBe(true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("fetch falls back to bundled templates when the server is unreachable", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    throw new Error("connection refused")
  }) as unknown as typeof fetch
  try {
    const { code, text } = await runConfigCli(["fetch"])
    expect(code).toBe(0)
    expect(text).toContain(getModelsPath())
    expect(await Bun.file(getModelsPath()).exists()).toBe(true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("fetch never writes secrets.toml, services.toml, or settings.toml", async () => {
  const restore = mockBundleFetch({ "models.toml": 'label = "x"\n' })
  try {
    await runConfigCli(["fetch"])
  } finally {
    restore()
  }
  const { getSecretsPath } = await import("../../../lib/config/secrets")
  const { getServicesPath } = await import("../../../lib/config/services")
  expect(await Bun.file(getSecretsPath()).exists()).toBe(false)
  expect(await Bun.file(getServicesPath()).exists()).toBe(false)
  expect(await Bun.file(getConfigPath()).exists()).toBe(false)
})

test("wizard --headless writes default config without prompting", async () => {
  const { code, text } = await runConfigCli(["wizard", "--headless"])
  expect(code).toBe(0)
  expect(text.length).toBeGreaterThan(0)
  expect(await Bun.file(getConfigPath()).exists()).toBe(true)
})
