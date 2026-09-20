import { expect, test } from "bun:test"
import type { MarketplaceScan } from "../../../lib/abilities/picker"
import { starterSelection } from "../../../lib/abilities/picker"

/** A scan shaped like the real marketplace: keyless and keyed entries, one stdio server, one broken. */
function scan(): MarketplaceScan {
  return {
    skills: [
      { name: "meeting-notes", type: "skill", local: false },
      { name: "broken-skill", type: "skill", local: false, error: "no SKILL.md" }
    ],
    personas: [{ name: "care", type: "persona", local: false }],
    tools: [
      { name: "open-meteo", type: "tool", local: false },
      { name: "paid-api", type: "tool", local: false, key: "required" }
    ],
    mcp: [
      { name: "geo-service", type: "mcp", local: false },
      { name: "context7", type: "mcp", local: false, key: "optional" },
      { name: "chrome-devtools", type: "mcp", local: false, runs: "bunx chrome-devtools-mcp@latest" },
      { name: "keyed-mcp", type: "mcp", local: false, key: "required" }
    ],
    toolScan: [],
    mcpScan: []
  } as unknown as MarketplaceScan
}

test("the starter set takes everything that needs no key", () => {
  const picked = starterSelection(scan())
  expect(picked.skills).toEqual(["meeting-notes"])
  expect(picked.personas).toEqual(["care"])
  // An optional key still works unkeyed, so it qualifies; a required one does not.
  expect(picked.tools).toEqual(["open-meteo"])
  expect(picked.mcp).toEqual(["geo-service", "context7"])
})

test("a keyless stdio MCP server is still left out", () => {
  // Enabling one spawns a process locally — that belongs behind the confirm gate in `kaja abilities`.
  expect(starterSelection(scan()).mcp).not.toContain("chrome-devtools")
})

test("broken entries are skipped", () => {
  expect(starterSelection(scan()).skills).not.toContain("broken-skill")
})
