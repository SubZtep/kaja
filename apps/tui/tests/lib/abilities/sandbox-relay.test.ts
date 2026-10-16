import { afterEach, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SANDBOX_ORIGIN } from "@kaja/nasi"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-sandbox-relay`

const { getConfigDir, invalidateConfigCache } = await import("../../../lib/config/config")
const { relayTo, sandboxedAbilities, signedOutSandbox } = await import("../../../lib/abilities/sandbox-relay")

afterEach(() => {
  rmSync(getConfigDir(), { recursive: true, force: true })
  invalidateConfigCache()
})

test("the abilities set to a sandbox, without the shell's key", async () => {
  mkdirSync(getConfigDir(), { recursive: true })
  writeFileSync(
    join(getConfigDir(), "settings.toml"),
    `[tools.hosts]\nchrome-devtools = "sandbox"\ntime = "computer"\nshell = "sandbox"\n`
  )
  invalidateConfigCache()
  expect(await sandboxedAbilities()).toEqual(["chrome-devtools"])
})

test("a sandboxed target's request goes to the API's relay, signed in, with the ability's key", async () => {
  const sent: { url: string; headers: Headers; body: string }[] = []
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      sent.push({ url: new URL(req.url).pathname, headers: req.headers, body: await req.text() })
      return Response.json({ ok: true })
    }
  })
  try {
    const relay = relayTo(`http://127.0.0.1:${server.port}`, "tok", ability => (ability === "keyed" ? "k1" : undefined))
    await relay.fetch(`${SANDBOX_ORIGIN}/mcp/keyed`, {
      method: "POST",
      headers: { "mcp-session-id": "s1" },
      body: "{}"
    })
    await relay.fetch(`${SANDBOX_ORIGIN}/mcp/time`, { method: "GET" })
    expect(sent.map(r => r.url)).toEqual(["/sandbox/relay/mcp/keyed", "/sandbox/relay/mcp/time"])
    expect(sent[0]!.headers.get("authorization")).toBe("Bearer tok")
    expect(sent[0]!.headers.get("x-kaja-ability-key")).toBe("k1")
    expect(sent[0]!.headers.get("mcp-session-id")).toBe("s1")
    expect(sent[0]!.body).toBe("{}")
    expect(sent[1]!.headers.get("x-kaja-ability-key")).toBeNull()
  } finally {
    server.stop(true)
  }
})

test("signed out, every request is refused at once", async () => {
  expect((await signedOutSandbox.fetch(`${SANDBOX_ORIGIN}/mcp/time`)).status).toBe(401)
})
