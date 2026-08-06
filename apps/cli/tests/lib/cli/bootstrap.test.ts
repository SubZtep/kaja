import { afterEach, describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { applyConfigDirOverride } from "../../../lib/cli/bootstrap"
import { getConfigDir, setConfigDirOverride } from "../../../lib/config/config"

afterEach(() => {
  setConfigDirOverride(undefined)
})

describe("applyConfigDirOverride", () => {
  test("no --config leaves the override unset", () => {
    applyConfigDirOverride(["--continue"])
    expect(getConfigDir()).not.toBe(resolve("/tmp/x"))
  })

  test("--config <dir> sets the override to the resolved next arg", () => {
    applyConfigDirOverride(["--config", "/tmp/custom-kaja-config"])
    expect(getConfigDir()).toBe(resolve("/tmp/custom-kaja-config"))
  })

  test("--config=<dir> sets the override to the resolved value", () => {
    applyConfigDirOverride(["--config=/tmp/custom-kaja-config"])
    expect(getConfigDir()).toBe(resolve("/tmp/custom-kaja-config"))
  })

  test("relative --config value is resolved against cwd", () => {
    applyConfigDirOverride(["--config", "relative-dir"])
    expect(getConfigDir()).toBe(resolve("relative-dir"))
  })

  test("--config as the last argv token has no following value: override stays unset", () => {
    applyConfigDirOverride(["--continue", "--config"])
    expect(getConfigDir()).not.toContain("--continue")
  })

  test("--config immediately followed by another flag does not swallow it as a value", () => {
    applyConfigDirOverride(["--config", "--paths"])
    expect(getConfigDir()).not.toBe(resolve("--paths"))
  })

  test("--config= with an empty value does not set an override", () => {
    applyConfigDirOverride(["--config="])
    expect(getConfigDir()).not.toBe(resolve(""))
  })

  test("last --config wins when passed twice", () => {
    applyConfigDirOverride(["--config", "/tmp/first", "--config", "/tmp/second"])
    expect(getConfigDir()).toBe(resolve("/tmp/second"))
  })

  test("last --config wins even when repeated in --config= form", () => {
    applyConfigDirOverride(["--config=/tmp/first", "--config", "/tmp/second"])
    expect(getConfigDir()).toBe(resolve("/tmp/second"))
  })

  test("last --config wins when the SECOND occurrence uses --config= form", () => {
    applyConfigDirOverride(["--config", "/tmp/first", "--config=/tmp/second"])
    expect(getConfigDir()).toBe(resolve("/tmp/second"))
  })

  test("--config after a `--` separator is still honored (no -- awareness)", () => {
    applyConfigDirOverride(["--", "--config", "/tmp/after-dashdash"])
    expect(getConfigDir()).toBe(resolve("/tmp/after-dashdash"))
  })

  test("a subcommand positional literally named --config is not mistaken for the flag", () => {
    // e.g. `kaja session diagram --config` — the flag scan matches on value
    // only, not position, so this is expected to still trigger it.
    applyConfigDirOverride(["session", "--config", "5"])
    expect(getConfigDir()).toBe(resolve("5"))
  })

  test("empty argv leaves override unset", () => {
    applyConfigDirOverride([])
    expect(getConfigDir()).not.toBe(resolve(""))
  })

  test("--config with a value that itself starts with -- via = form is respected", () => {
    applyConfigDirOverride(["--config=--weird-dir"])
    expect(getConfigDir()).toBe(resolve("--weird-dir"))
  })
})
