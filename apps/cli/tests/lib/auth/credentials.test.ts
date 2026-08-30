import { expect, test } from "bun:test"
import { tmpdir } from "node:os"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-auth-credentials`

const { clearCredentials, loadCredentials, saveCredentials } = await import("../../../lib/auth/credentials")

test("loadCredentials returns undefined when nothing is stored", async () => {
  await clearCredentials()
  expect(await loadCredentials()).toBeUndefined()
})

test("saveCredentials then loadCredentials round-trips", async () => {
  await saveCredentials({ apiUrl: "https://api.kaja.io", token: "tok_abc" })
  const loaded = await loadCredentials()
  expect(loaded).toEqual({ apiUrl: "https://api.kaja.io", token: "tok_abc" })
})

test("saved credentials file is 0o600", async () => {
  await saveCredentials({ apiUrl: "https://api.kaja.io", token: "tok_abc" })
  const { join } = await import("node:path")
  const { getPaths } = await import("../../../lib/paths")
  const { stat } = await import("node:fs/promises")
  const path = join(getPaths().config, "credentials.json")
  const info = await stat(path)
  expect(info.mode & 0o777).toBe(0o600)
})

test("clearCredentials removes the file", async () => {
  await saveCredentials({ apiUrl: "https://api.kaja.io", token: "tok_abc" })
  await clearCredentials()
  expect(await loadCredentials()).toBeUndefined()
})

test("loadCredentials returns undefined on corrupt JSON", async () => {
  const { join } = await import("node:path")
  const { getPaths } = await import("../../../lib/paths")
  const path = join(getPaths().config, "credentials.json")
  await Bun.write(path, "not json")
  expect(await loadCredentials()).toBeUndefined()
})
