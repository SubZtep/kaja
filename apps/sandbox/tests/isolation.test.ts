import { describe, expect, test } from "bun:test"
import { asUser, UserIsolation } from "../src/isolation"

describe("UserIsolation", () => {
  test("each user keeps their own uid, with a private group of the same number", () => {
    const isolation = new UserIsolation({ first: 30_000, count: 10 })
    const a = isolation.runAs("a")
    expect(a).toEqual({ uid: 30_000, gid: 30_000 })
    expect(isolation.runAs("b")).toEqual({ uid: 30_001, gid: 30_001 })
    expect(isolation.runAs("a")).toEqual(a)
  })

  test("once every uid is taken, the least recently used one is reused", () => {
    const isolation = new UserIsolation({ first: 30_000, count: 2 })
    isolation.runAs("a")
    isolation.runAs("b")
    isolation.runAs("a")
    expect(isolation.runAs("c").uid).toBe(30_001)
    expect(isolation.runAs("a").uid).toBe(30_000)
  })

  test("is off unless the sandbox runs as root", async () => {
    if (process.getuid?.() === 0) return
    expect(await UserIsolation.create({ enabled: true })).toBeUndefined()
  })
})

test("asUser runs the command through prlimit and setpriv as that user, with no capabilities left, keeping its args", () => {
  const wrapped = asUser("bunx", ["pkg@1", "--flag"], { uid: 20_001, gid: 20_001 }, 1500)
  expect(wrapped.command).toBe("prlimit")
  expect(wrapped.args.slice(0, 4)).toEqual(["--nproc=512", "--nofile=4096", "--", "setpriv"])
  expect(wrapped.args.slice(4, 11)).toEqual([
    "--reuid=20001",
    "--regid=20001",
    "--groups=1500",
    "--inh-caps=-all",
    "--bounding-set=-all",
    "--no-new-privs",
    "--"
  ])
  expect(wrapped.args.slice(-3)).toEqual(["bunx", "pkg@1", "--flag"])
  expect(asUser("x", [], { uid: 1, gid: 1 }, undefined).args).toContain("--clear-groups")
})
