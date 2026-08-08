import { afterEach, beforeEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { write } from "bun"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-watcher`

const { setConfigDirOverride, getConfigPath } = await import("../../../lib/config/config")
const { getServicesPath, invalidateServicesCache, services } = await import("../../../lib/config/services")
const { getSecretsPath, invalidateSecretsCache, secrets } = await import("../../../lib/config/secrets")
const { startConfigWatcher, stopConfigWatcher, preferencesEvents, configChangedEvents } = await import(
  "../../../lib/config/config-watcher"
)

beforeEach(() => {
  invalidateServicesCache()
  invalidateSecretsCache()
})

afterEach(() => {
  stopConfigWatcher()
  setConfigDirOverride(undefined)
  invalidateServicesCache()
  invalidateSecretsCache()
})

/** Polls until `check()` returns true or the timeout elapses, so tests don't hardcode a sleep longer than the watcher's debounce window. */
async function waitUntil(check: () => boolean | Promise<boolean>, timeoutMs = 2000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error("waitUntil timed out")
}

test("editing secrets.toml externally invalidates both services() and secrets() without calling invalidate*Cache() manually", async () => {
  const dir = `${tmpdir()}/kaja-test-watcher-secrets-${Math.random()}`
  setConfigDirOverride(dir)
  await write(join(dir, "services.toml"), '[api]\nbaseUrl = "https://api.example.test"\n')
  await write(getSecretsPath(), '[api]\ntoken = "first"\n')

  expect((await services()).api?.token).toBe("first")
  startConfigWatcher()

  await write(getSecretsPath(), '[api]\ntoken = "second"\n')
  await waitUntil(async () => (await secrets()).api?.token === "second")
  expect((await services()).api?.token).toBe("second")
})

test("editing services.toml externally invalidates the merged services() view", async () => {
  const dir = `${tmpdir()}/kaja-test-watcher-services-${Math.random()}`
  setConfigDirOverride(dir)
  await write(getServicesPath(), '[api]\nbaseUrl = "https://first.example.test"\n')
  await write(join(dir, "secrets.toml"), '[api]\ntoken = "shared"\n')

  expect((await services()).api?.baseUrl).toBe("https://first.example.test")
  startConfigWatcher()

  await write(getServicesPath(), '[api]\nbaseUrl = "https://second.example.test"\n')
  await waitUntil(async () => (await services()).api?.baseUrl === "https://second.example.test")
})

test("editing settings.toml's [preferences] externally dispatches a preferences event with the new values", async () => {
  const dir = `${tmpdir()}/kaja-test-watcher-settings-${Math.random()}`
  setConfigDirOverride(dir)
  await write(getConfigPath(), "[models]\n[preferences]\nsounds = true\nvoice = false\n")

  let received: { sounds?: boolean; voice?: boolean } | undefined
  const onPreferences = (event: Event) => {
    received = (event as CustomEvent<{ sounds?: boolean; voice?: boolean }>).detail
  }
  preferencesEvents.addEventListener("preferences", onPreferences)
  startConfigWatcher()

  try {
    await write(getConfigPath(), "[models]\n[preferences]\nsounds = false\nvoice = true\n")
    await waitUntil(() => received?.sounds === false && received?.voice === true)
  } finally {
    preferencesEvents.removeEventListener("preferences", onPreferences)
  }
})

test("unrelated files in the config dir are ignored", async () => {
  const dir = `${tmpdir()}/kaja-test-watcher-unrelated-${Math.random()}`
  setConfigDirOverride(dir)
  await write(join(dir, "services.toml"), '[api]\nbaseUrl = "https://api.example.test"\n')
  await write(join(dir, "secrets.toml"), '[api]\ntoken = "unchanged"\n')

  const cached = await services()
  startConfigWatcher()

  await write(join(dir, "mcp.toml"), "\n")
  // Give the watcher's debounce window a chance to fire if it were (incorrectly) reacting.
  await new Promise(resolve => setTimeout(resolve, 400))
  expect(await services()).toBe(cached)
})

test("stopConfigWatcher stops reacting to further changes", async () => {
  const dir = `${tmpdir()}/kaja-test-watcher-stop-${Math.random()}`
  setConfigDirOverride(dir)
  await write(join(dir, "services.toml"), '[api]\nbaseUrl = "https://api.example.test"\n')
  await write(getSecretsPath(), '[api]\ntoken = "first"\n')
  expect((await services()).api?.token).toBe("first")

  startConfigWatcher()
  await write(getSecretsPath(), '[api]\ntoken = "second"\n')
  await waitUntil(async () => (await secrets()).api?.token === "second")

  stopConfigWatcher()
  const cached = await services()
  await write(getSecretsPath(), '[api]\ntoken = "third"\n')
  await new Promise(resolve => setTimeout(resolve, 400))
  expect(await services()).toBe(cached)
})

test("starting the watcher twice is a no-op (no duplicate reactions)", async () => {
  const dir = `${tmpdir()}/kaja-test-watcher-idempotent-${Math.random()}`
  setConfigDirOverride(dir)
  await write(join(dir, "services.toml"), '[api]\nbaseUrl = "https://api.example.test"\n')
  await write(getSecretsPath(), '[api]\ntoken = "first"\n')

  startConfigWatcher()
  startConfigWatcher()

  await write(getSecretsPath(), '[api]\ntoken = "second"\n')
  await waitUntil(async () => (await secrets()).api?.token === "second")
  expect((await services()).api?.token).toBe("second")
})

test("configChangedEvents fires once per reacted-to file, for both secrets.toml and settings.toml edits", async () => {
  const dir = `${tmpdir()}/kaja-test-watcher-changed-event-${Math.random()}`
  setConfigDirOverride(dir)
  await write(join(dir, "services.toml"), '[api]\nbaseUrl = "https://api.example.test"\n')
  await write(getSecretsPath(), '[api]\ntoken = "first"\n')
  await write(getConfigPath(), "[models]\n[preferences]\nsounds = true\n")

  let fired = 0
  const onChanged = () => {
    fired++
  }
  configChangedEvents.addEventListener("changed", onChanged)
  startConfigWatcher()

  try {
    await write(getSecretsPath(), '[api]\ntoken = "second"\n')
    await waitUntil(() => fired >= 1)

    await write(getConfigPath(), "[models]\n[preferences]\nsounds = false\n")
    await waitUntil(() => fired >= 2)
  } finally {
    configChangedEvents.removeEventListener("changed", onChanged)
  }
})

test("configChangedEvents does not fire for unrelated files in the config dir", async () => {
  const dir = `${tmpdir()}/kaja-test-watcher-changed-unrelated-${Math.random()}`
  setConfigDirOverride(dir)
  await write(join(dir, "services.toml"), '[api]\nbaseUrl = "https://api.example.test"\n')

  let fired = false
  const onChanged = () => {
    fired = true
  }
  configChangedEvents.addEventListener("changed", onChanged)
  startConfigWatcher()

  try {
    await write(join(dir, "mcp.toml"), "\n")
    await new Promise(resolve => setTimeout(resolve, 400))
    expect(fired).toBe(false)
  } finally {
    configChangedEvents.removeEventListener("changed", onChanged)
  }
})
