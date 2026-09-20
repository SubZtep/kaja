import { afterEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { log } from "../../lib/logger"

const dir = mkdtempSync(join(tmpdir(), "kaja-logger-test-"))
const file = join(dir, "nested", "kaja.log")

afterEach(() => {
  delete process.env.KAJA_LOG_LEVEL
  delete process.env.KAJA_LOG_FILE
  rmSync(join(dir, "nested"), { recursive: true, force: true })
})

test("is silent unless both the level and the file are set", () => {
  log.error("nothing")
  process.env.KAJA_LOG_LEVEL = "debug"
  log.error("still nothing: no file")
  process.env.KAJA_LOG_FILE = file
  delete process.env.KAJA_LOG_LEVEL
  log.error("still nothing: no level")
  expect(existsSync(file)).toBe(false)
})

test("appends a JSON line per call at or above the level, serializing errors", () => {
  process.env.KAJA_LOG_LEVEL = "warn"
  process.env.KAJA_LOG_FILE = file
  log.info("below the level")
  log.warn("Copy failed", { error: new Error("boom"), src: "a.png" })
  const [line, ...rest] = readFileSync(file, "utf8").trim().split("\n")
  expect(rest).toEqual([])
  const entry = JSON.parse(line!)
  expect(entry).toMatchObject({
    level: "warn",
    msg: "Copy failed",
    src: "a.png",
    error: { name: "Error", message: "boom" }
  })
  expect(typeof entry.time).toBe("string")
})
