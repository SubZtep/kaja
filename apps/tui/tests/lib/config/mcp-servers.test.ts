import { afterEach, beforeEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { write } from "bun"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-mcp-servers`

const { setConfigDirOverride } = await import("../../../lib/config/config")
const { getMcpPath, loadMcpServers } = await import("../../../lib/config/mcp-servers")
const { invalidateSecretsCache } = await import("../../../lib/config/secrets")

// Other test files sharing this bun test process may have already cached secrets() with their
// own fixtures — invalidate before every test, not just after.
beforeEach(() => {
  invalidateSecretsCache()
})

afterEach(() => {
  setConfigDirOverride(undefined)
  invalidateSecretsCache()
})

async function setup(mcpToml: string, secretsToml: string) {
  const dir = `${tmpdir()}/kaja-test-mcp-servers-${Math.random()}`
  setConfigDirOverride(dir)
  await write(join(dir, "mcp.toml"), mcpToml)
  await write(join(dir, "secrets.toml"), secretsToml)
}

test("missing file: writes the template and returns the default location server with its secret folded in", async () => {
  const dir = `${tmpdir()}/kaja-test-mcp-servers-missing-${Math.random()}`
  setConfigDirOverride(dir)

  expect(await Bun.file(getMcpPath()).exists()).toBe(false)
  const servers = await loadMcpServers()

  expect(await Bun.file(getMcpPath()).exists()).toBe(true)
  expect(servers).toEqual([
    {
      id: "location",
      url: "https://ip2geo.demo.land/mcp",
      headers: { Authorization: "Bearer guest" }
    }
  ])
})

test("HTTP server with a matching secret: folds the secret's keys into headers", async () => {
  await setup(
    `
[[servers]]
id = "geo"
url = "https://geo.example.test/mcp"
`,
    `
[mcp.geo]
Authorization = "Bearer secret-token"
`
  )
  const [server] = await loadMcpServers()
  expect(server).toEqual({
    id: "geo",
    url: "https://geo.example.test/mcp",
    headers: { Authorization: "Bearer secret-token" }
  })
})

test("stdio server with a matching secret: folds the secret's keys into env, not headers", async () => {
  await setup(
    `
[[servers]]
id = "context7"
command = "bunx"
args = ["-y", "@upstash/context7-mcp"]
`,
    `
[mcp.context7]
CONTEXT7_API_KEY = "ctx7sk-test"
`
  )
  const [server] = await loadMcpServers()
  expect(server).toEqual({
    id: "context7",
    command: "bunx",
    args: ["-y", "@upstash/context7-mcp"],
    env: { CONTEXT7_API_KEY: "ctx7sk-test" }
  })
})

test("server with no matching secret passes through unchanged", async () => {
  await setup(
    `
[[servers]]
id = "playwright"
command = "bunx"
args = ["@playwright/mcp@latest"]
`,
    ""
  )
  const [server] = await loadMcpServers()
  expect(server).toEqual({
    id: "playwright",
    command: "bunx",
    args: ["@playwright/mcp@latest"],
    env: {}
  })
})

test("existing env/headers values are preserved; the secret is merged on top, not a replacement", async () => {
  await setup(
    `
[[servers]]
id = "geo"
url = "https://geo.example.test/mcp"
headers = { "X-Client" = "kaja" }
`,
    `
[mcp.geo]
Authorization = "Bearer secret-token"
`
  )
  const [server] = await loadMcpServers()
  expect(server).toMatchObject({
    headers: { "X-Client": "kaja", Authorization: "Bearer secret-token" }
  })
})

test("multiple servers: only the ones with a matching secret id get one folded in", async () => {
  await setup(
    `
[[servers]]
id = "geo"
url = "https://geo.example.test/mcp"

[[servers]]
id = "playwright"
command = "bunx"
args = ["@playwright/mcp@latest"]
`,
    `
[mcp.geo]
Authorization = "Bearer secret-token"
`
  )
  const servers = await loadMcpServers()
  expect(servers).toEqual([
    { id: "geo", url: "https://geo.example.test/mcp", headers: { Authorization: "Bearer secret-token" } },
    { id: "playwright", command: "bunx", args: ["@playwright/mcp@latest"], env: {} }
  ])
})

test("empty servers list with no secrets configured resolves cleanly", async () => {
  await setup("", "")
  expect(await loadMcpServers()).toEqual([])
})
