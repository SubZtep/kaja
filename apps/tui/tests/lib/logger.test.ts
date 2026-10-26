import { afterEach, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { log, logTarget } from "../../src/lib/logger"
import { getLogFile } from "../../src/lib/paths"

const dir = mkdtempSync(join(tmpdir(), "kaja-logger-test-"))
const file = join(dir, "nested", "kaja.log")
// The preload's own log file, put back after each test
const preloadFile = process.env.KAJA_LOG_FILE

afterEach(() => {
  delete process.env.KAJA_LOG_LEVEL
  process.env.KAJA_LOG_FILE = preloadFile
  rmSync(join(dir, "nested"), { recursive: true, force: true })
})

test("KAJA_LOG_LEVEL=off, or any value that isn't a level, writes nothing", () => {
  process.env.KAJA_LOG_FILE = file
  process.env.KAJA_LOG_LEVEL = "off"
  log.error("nothing")
  expect(logTarget()).toBeUndefined()
  process.env.KAJA_LOG_LEVEL = "loud"
  log.error("still nothing")
  expect(existsSync(file)).toBe(false)
})

test("unset, it keeps warnings and errors in the state folder's kaja.log", () => {
  delete process.env.KAJA_LOG_FILE
  expect(logTarget()).toEqual({ file: getLogFile(), min: 3 })
})

test("appends a JSON line per call at or above the level, serializing errors", () => {
  process.env.KAJA_LOG_FILE = file
  log.info("below the default level")
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

test.skipIf(process.platform === "win32")("the file is readable by its owner only", () => {
  process.env.KAJA_LOG_FILE = file
  log.error("private")
  expect(statSync(file).mode & 0o777).toBe(0o600)
})

test("a file past its size limit starts over, the old one kept beside it", () => {
  const big = join(dir, "nested", "big.log")
  mkdirSync(join(dir, "nested"), { recursive: true })
  writeFileSync(big, "x".repeat(1024 * 1024 + 1))
  process.env.KAJA_LOG_FILE = big
  log.error("fresh")
  expect(readFileSync(big, "utf8")).toContain('"msg":"fresh"')
  expect(statSync(`${big}.1`).size).toBe(1024 * 1024 + 1)
})
