import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TOML } from "bun"
import { AUTO_UPDATE_INTERVAL_MS, autoUpdateAbilities } from "../../../lib/abilities/auto-update"
import { LOCK_FILE } from "../../../lib/abilities/sync"
import { invalidateConfigCache, setConfigDirOverride } from "../../../lib/config/config"

describe("autoUpdateAbilities", () => {
  let dir: string
  let cfg: string
  let calls: number
  const update = async () => {
    calls++
    return { code: 0 }
  }

  beforeEach(async () => {
    cfg = await mkdtemp(join(tmpdir(), "kaja-auto-update-cfg-"))
    setConfigDirOverride(cfg)
    invalidateConfigCache()
    dir = await mkdtemp(join(tmpdir(), "kaja-auto-update-"))
    calls = 0
  })
  afterEach(async () => {
    setConfigDirOverride(undefined)
    invalidateConfigCache()
    await rm(dir, { recursive: true, force: true })
    await rm(cfg, { recursive: true, force: true })
  })

  async function lockAgedBy(ms: number) {
    const path = join(dir, LOCK_FILE)
    await writeFile(path, "{}")
    const when = new Date(Date.now() - ms)
    await utimes(path, when, when)
  }

  test("never-synced machine is left alone", async () => {
    expect(await autoUpdateAbilities({ dir, update })).toBe(false)
    expect(calls).toBe(0)
  })

  test("fresh sync is not repeated", async () => {
    await lockAgedBy(60_000)
    expect(await autoUpdateAbilities({ dir, update })).toBe(false)
    expect(calls).toBe(0)
  })

  test("stale sync pulls again", async () => {
    await lockAgedBy(AUTO_UPDATE_INTERVAL_MS + 60_000)
    expect(await autoUpdateAbilities({ dir, update })).toBe(true)
    expect(calls).toBe(1)
  })

  test("settings can turn the pull off", async () => {
    await lockAgedBy(AUTO_UPDATE_INTERVAL_MS + 60_000)
    for (const marketplace of [{ autoFetch: false }, { enabled: false }]) {
      await Bun.write(join(cfg, "settings.toml"), TOML.stringify({ marketplace })!)
      invalidateConfigCache()
      expect(await autoUpdateAbilities({ dir, update })).toBe(false)
    }
    expect(calls).toBe(0)
  })

  test("a failing update is swallowed", async () => {
    await lockAgedBy(AUTO_UPDATE_INTERVAL_MS + 60_000)
    expect(await autoUpdateAbilities({ dir, update: async () => ({ code: 1 }) })).toBe(false)
    expect(await autoUpdateAbilities({ dir, update: async () => Promise.reject(new Error("x")) })).toBe(false)
  })
})
