import { expect, test } from "bun:test"
import { pickUnrunnable } from "../../../src/lib/abilities/hosts"

test("offers only abilities a persona uses that miss something here and aren't already on a sandbox", () => {
  const entries = [
    { name: "time", needs: ["uvx", "pipx", "docker"] },
    { name: "chrome-devtools", requires: ["Chrome"] },
    { name: "filesystem", needs: ["npx"], localOnly: true },
    { name: "sequential-thinking" },
    { name: "unused", needs: ["uvx"] }
  ]
  const used = new Set(["time", "chrome-devtools", "filesystem", "sequential-thinking"])
  expect(pickUnrunnable(entries, used, { "chrome-devtools": "sandbox" })).toEqual([
    { name: "time", needs: ["uvx", "pipx", "docker"], requires: [], localOnly: false },
    { name: "filesystem", needs: ["npx"], requires: [], localOnly: true }
  ])
})
