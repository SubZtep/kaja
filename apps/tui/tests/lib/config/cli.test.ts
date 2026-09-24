import { afterEach, beforeAll, expect, test } from "bun:test"
import { tmpdir } from "node:os"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-config-cli`

const { runConfigCli } = await import("../../../lib/config/cli")
const { getConfigDir, getConfigPath } = await import("../../../lib/config/config")
const { getMcpPath } = await import("../../../lib/config/mcp-servers")
const { getModelsPath } = await import("../../../lib/models/models")
const { getPaths } = await import("../../../lib/paths")
const { join } = await import("node:path")

async function clearEtag() {
  const { $ } = await import("bun")
  // fetchRemoteConfigBundle() caches the last seen ETag outside the config dir — clear it so tests don't leak a 304 into each other.
  await $`rm -f ${join(getPaths().temp, "kaja-config-fetch-etag")}`.quiet().nothrow()
}

// Also before the first test: the cache may hold an ETag from another test file or a real `kaja config fetch`
beforeAll(clearEtag)

afterEach(async () => {
  const { $ } = await import("bun")
  await $`rm -f ${getMcpPath()} ${getMcpPath()}.bak ${getMcpPath()}.bak2 ${getModelsPath()} ${getModelsPath()}.bak ${getModelsPath()}.bak2 ${getConfigPath()}`
    .quiet()
    .nothrow()
  await $`rm -rf ${getConfigDir()} ${getConfigDir()}.bak ${getConfigDir()}.bak2`.quiet().nothrow()
  await clearEtag()
})

test("fetch writes models.toml from the bundled template, and neither personas nor mcp.toml", async () => {
  const { code, text } = await runConfigCli(["fetch"])
  expect(code).toBe(0)
  expect(text).toContain(getModelsPath())
  expect(text).not.toContain("personas")
  expect(text).not.toContain(getMcpPath())
  expect(await Bun.file(getModelsPath()).exists()).toBe(true)
  // MCP servers come from the marketplace (`kaja abilities`); mcp.toml is the user's own file.
  expect(await Bun.file(getMcpPath()).exists()).toBe(false)
})

test("fetch leaves an existing mcp.toml alone", async () => {
  await Bun.write(getMcpPath(), "servers = []\n# mine\n")
  const { code } = await runConfigCli(["fetch"])
  expect(code).toBe(0)
  expect(await Bun.file(getMcpPath()).text()).toBe("servers = []\n# mine\n")
  expect(await Bun.file(`${getMcpPath()}.bak`).exists()).toBe(false)
})

test("fetch backs up an existing models.toml instead of overwriting it", async () => {
  // Each fetch needs a fresh etag and body: a repeated etag yields a 304 ("all up to date")
  // and identical content is a no-op, and neither writes the .bak2 this asserts on.
  let restore = mockBundleFetch({ "models.toml": "providers = {}\n" }, '"v1"')
  try {
    await Bun.write(getModelsPath(), "old content")

    const first = await runConfigCli(["fetch"])
    expect(first.code).toBe(0)
    expect(first.text).toContain(".bak")
    expect(await Bun.file(`${getModelsPath()}.bak`).text()).toBe("old content")
    expect(await Bun.file(getModelsPath()).text()).not.toBe("old content")

    await Bun.write(getModelsPath(), "newer content")
    restore()
    restore = mockBundleFetch({ "models.toml": 'label = "changed"\n' }, '"v2"')
    const second = await runConfigCli(["fetch"])
    expect(second.code).toBe(0)
    expect(second.text).toContain(".bak2")
    expect(await Bun.file(`${getModelsPath()}.bak`).text()).toBe("old content")
    expect(await Bun.file(`${getModelsPath()}.bak2`).text()).toBe("newer content")
  } finally {
    restore()
  }
})

test("fetch is a no-op (no new backup) when the file already matches the bundled template", async () => {
  const { code: firstCode } = await runConfigCli(["fetch"])
  expect(firstCode).toBe(0)

  const { code, text } = await runConfigCli(["fetch"])
  expect(code).toBe(0)
  expect(text).not.toContain(".bak")
  expect(await Bun.file(`${getModelsPath()}.bak`).exists()).toBe(false)
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

test("fetch downloads the bundle from the server when reachable, leaving out personas and MCP servers", async () => {
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
    // Personas and MCP servers come from the marketplace sync; a server that still sends them doesn't write them.
    expect(await Bun.file(join(getConfigDir(), "personas", "default.toml")).exists()).toBe(false)
    expect(await Bun.file(getMcpPath()).exists()).toBe(false)
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
    const { code } = await runConfigCli(["fetch"], { offline: true })
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

test("fetch writes secrets.toml from the bundled template, but never settings.toml", async () => {
  const restore = mockBundleFetch({ "models.toml": 'label = "x"\n' })
  try {
    await runConfigCli(["fetch"])
  } finally {
    restore()
  }
  const { getSecretsPath } = await import("../../../lib/config/secrets")
  expect(await Bun.file(getSecretsPath()).exists()).toBe(true)
  expect(await Bun.file(getConfigPath()).exists()).toBe(false)
})

test("fetch leaves a secrets.toml holding keys alone: no backup, nothing overwritten", async () => {
  const { getSecretsPath } = await import("../../../lib/config/secrets")
  const saved = '[providers.fireworks]\napi_key = "fw-secret"\n'
  await Bun.write(getSecretsPath(), saved)

  const { code, text } = await runConfigCli(["fetch"], { offline: true })
  expect(code).toBe(0)
  expect(text).toContain(`${getSecretsPath()} holds your keys`)
  expect(await Bun.file(`${getSecretsPath()}.bak`).exists()).toBe(false)
  expect(await Bun.file(getSecretsPath()).text()).toBe(saved)
})

test("fetch leaves a secrets.toml that doesn't parse alone too, since it may still hold keys", async () => {
  const { getSecretsPath } = await import("../../../lib/config/secrets")
  await Bun.write(getSecretsPath(), 'api_key = "half-typed\n')

  const { text } = await runConfigCli(["fetch"], { offline: true })
  expect(text).toContain("holds your keys")
  expect(await Bun.file(getSecretsPath()).text()).toBe('api_key = "half-typed\n')
})

test("wizard --headless writes default config without prompting", async () => {
  const { code, text } = await runConfigCli(["wizard"], { headless: true })
  expect(code).toBe(0)
  expect(text.length).toBeGreaterThan(0)
  expect(await Bun.file(getConfigPath()).exists()).toBe(true)
})

test("fetch still writes a missing models.toml when the cached ETag would get a 304", async () => {
  const restore = mockBundleFetch({ "models.toml": 'label = "fresh"\n' }, '"same"')
  try {
    await Bun.write(join(getPaths().temp, "kaja-config-fetch-etag"), '"same"')
    const { code } = await runConfigCli(["fetch"])
    expect(code).toBe(0)
    expect(await Bun.file(getModelsPath()).text()).toContain("fresh")
  } finally {
    restore()
  }
})
