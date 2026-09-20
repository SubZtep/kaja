import { afterAll, beforeEach, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const configRoot = `${tmpdir()}/kaja-test-xdg-config-doctor-credentials`
process.env.XDG_CONFIG_HOME = configRoot

const { invalidateSecretsCache } = await import("../../../lib/config/secrets")
const { collectCredentials, outcomeLine, resolveCredentials, summaryLines } = await import(
  "../../../lib/doctor/credentials"
)
type CredentialItem = import("../../../lib/doctor/credentials").CredentialItem

const kajaDir = join(configRoot, "kaja")

function put(rel: string, content: string) {
  const path = join(kajaDir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

beforeEach(() => {
  process.env.XDG_CONFIG_HOME = configRoot
  rmSync(kajaDir, { recursive: true, force: true })
  invalidateSecretsCache()
})

afterAll(() => {
  rmSync(configRoot, { recursive: true, force: true })
})

/** A fake item that records saves; `works` decides which values pass the test. */
function fakeItem(over: Partial<CredentialItem> & { works?: (value: string | undefined) => boolean }) {
  const saved: string[] = []
  const item: CredentialItem = {
    label: "thing",
    where: "[thing] key",
    present: false,
    required: true,
    check: async value => (over.works?.(value) ? { ok: true } : { ok: false, reason: "rejected" }),
    save: async value => {
      saved.push(value)
    },
    ...over
  }
  return { item, saved }
}

const io = (answers: (string | undefined)[], saveAnyway = false) => {
  const titles: string[] = []
  return {
    titles,
    io: {
      interactive: true,
      ask: async (title: string) => {
        titles.push(title)
        return answers.shift()
      },
      askSaveAnyway: async () => saveAnyway
    }
  }
}

test("a saved value that passes is ok; a keyless provider that works needs nothing", async () => {
  const present = fakeItem({ present: true, works: () => true })
  const keyless = fakeItem({ required: false, works: value => value === undefined })
  const outcomes = await resolveCredentials([present.item, keyless.item], io([]).io)
  expect(outcomes.map(o => o.status)).toEqual(["ok", "keyless"])
})

test("without a terminal, missing and failing items are only reported", async () => {
  const missing = fakeItem({})
  const failing = fakeItem({ present: true, works: () => false })
  const outcomes = await resolveCredentials([missing.item, failing.item], { ...io([]).io, interactive: false })
  expect(outcomes.map(o => o.status)).toEqual(["missing", "failing"])
  expect(missing.saved).toEqual([])
  expect(summaryLines(outcomes, "/x/secrets.toml")).toEqual([
    "Still to fix, in /x/secrets.toml:",
    "  [thing] key: missing",
    "  [thing] key: rejected",
    "Edit the file, or run `kaja doctor` in a terminal to be asked for them."
  ])
})

test("a missing value is asked for, tested, then saved", async () => {
  const { item, saved } = fakeItem({ hint: "header X-Key", works: value => value === "good" })
  const { io: prompts, titles } = io(["good"])
  const outcomes = await resolveCredentials([item], prompts)
  expect(titles).toEqual(["thing needs its key or token (header X-Key)."])
  expect(saved).toEqual(["good"])
  expect(outcomes[0]!.status).toBe("saved")
  expect(outcomeLine(outcomes[0]!)).toBe("  ✓ thing: saved, and it works")
})

test("a failing saved value asks for a new one with the reason", async () => {
  const { item, saved } = fakeItem({ present: true, works: value => value === "new" })
  const { io: prompts, titles } = io(["new"])
  const outcomes = await resolveCredentials([item], prompts)
  expect(titles).toEqual(["thing didn't work: rejected. Enter a new key."])
  expect(saved).toEqual(["new"])
  expect(outcomes[0]!.status).toBe("saved")
})

test("a new value that fails is saved only when the user says so", async () => {
  const declined = fakeItem({ works: () => false })
  const kept = await resolveCredentials([declined.item], io(["bad"], false).io)
  expect(declined.saved).toEqual([])
  expect(kept[0]).toMatchObject({ status: "missing", reason: "rejected" })

  const accepted = fakeItem({ works: () => false })
  const saved = await resolveCredentials([accepted.item], io(["bad"], true).io)
  expect(accepted.saved).toEqual(["bad"])
  expect(saved[0]).toMatchObject({ status: "saved-failing", reason: "rejected" })
  expect(summaryLines(saved, "/s")).toContain("  [thing] key: rejected")
})

test("skipping leaves it on the to-do list; an untestable value is saved as untested", async () => {
  const skipped = fakeItem({})
  expect((await resolveCredentials([skipped.item], io([undefined]).io))[0]!.status).toBe("missing")

  const untestable = fakeItem({ check: undefined })
  const outcomes = await resolveCredentials([untestable.item], io(["v"]).io)
  expect(untestable.saved).toEqual(["v"])
  expect(outcomes[0]!.status).toBe("saved-untested")
  expect(summaryLines(outcomes, "/s")).toEqual(["All keys and tokens check out."])
})

test("collects providers, keyed abilities, declared MCP secrets and configured services", async () => {
  put(
    "models.toml",
    `[providers.local]\nbase_url = "http://localhost:11434/v1"\n\n[models.chat]\nmodel = "m"\ntask = "chat"\nprovider = "local"\n`
  )
  put("abilities.toml", `tools = ["gh", "open"]\n`)
  put(
    "marketplace/tools/gh.toml",
    `name = "gh"\ndescription = "x"\nbaseUrl = "https://api.github.com"\nauth = { type = "apiKey", in = "header", name = "Authorization", prefix = "Bearer " }\n\n[[tools]]\nname = "gh_get"\ndescription = "x"\npath = "/x"\n`
  )
  put(
    "marketplace/tools/open.toml",
    `name = "open"\ndescription = "x"\nbaseUrl = "https://api.open.test"\n\n[[tools]]\nname = "open_get"\ndescription = "x"\npath = "/x"\n`
  )
  put(
    "mcp.toml",
    `[[servers]]\nid = "ctx"\ncommand = "true"\nsecrets = ["CTX_KEY", "CTX_ID"]\n\n[[servers]]\nid = "plain"\nurl = "https://mcp.example.com"\n`
  )
  put("services.toml", `[location]\nserviceUrl = "https://geo.example.com"\n\n[telegram]\nallowedUserIds = [1]\n`)
  put("secrets.toml", `[mcp.ctx]\nCTX_KEY = "k"\n\n[webSearch]\napiKey = "b"\n`)

  const items = await collectCredentials()
  expect(items.map(i => [i.where, i.present, i.required, i.hint])).toEqual([
    ["[providers.local] api_key", false, false, undefined],
    ["[abilities.gh] apiKey", false, true, "header Authorization"],
    ["[mcp.ctx] CTX_KEY", true, true, "env CTX_KEY"],
    ["[mcp.ctx] CTX_ID", false, true, "env CTX_ID"],
    ["[location] apiKey", false, true, "header X-API-Key"],
    ["[telegram] botToken", false, true, undefined],
    ["[webSearch] apiKey", true, false, undefined]
  ])
})

test("an MCP secret can't be tested while another declared one is still missing", async () => {
  put("mcp.toml", `[[servers]]\nid = "ctx"\ncommand = "true"\nsecrets = ["A", "B"]\n`)
  const items = await collectCredentials()
  expect(await items[0]!.check?.("value-for-a")).toBeUndefined()
})

test("MCP abilities with key auth become items; optional keys aren't required", async () => {
  put("abilities.toml", `mcp = ["docs", "private", "open"]\ntools = ["weather"]\n`)
  put(
    "marketplace/mcp/docs.toml",
    `name = "docs"\ndescription = "x"\nurl = "https://mcp.docs.test/mcp"\nauth = { type = "apiKey", in = "header", name = "Authorization", optional = true }\n`
  )
  put(
    "marketplace/mcp/private.toml",
    `name = "private"\ndescription = "x"\ntransport = "stdio"\ncommand = "true"\nauth = { type = "apiKey", in = "env", name = "P_KEY" }\n`
  )
  put("marketplace/mcp/open.toml", `name = "open"\ndescription = "x"\nurl = "https://mcp.open.test/mcp"\n`)
  put(
    "marketplace/tools/weather.toml",
    `name = "weather"\ndescription = "x"\nbaseUrl = "https://api.weather.test"\nauth = { type = "apiKey", in = "query", name = "key", optional = true }\n\n[[tools]]\nname = "forecast"\ndescription = "x"\npath = "/f"\n`
  )
  put("mcp.toml", "servers = []\n")
  put("services.toml", "")
  put("secrets.toml", "")

  const items = await collectCredentials()
  expect(items.map(i => [i.where, i.required, i.hint])).toEqual([
    ["[abilities.weather] apiKey", false, "query key"],
    ["[abilities.docs] apiKey", false, "header Authorization"],
    ["[abilities.private] apiKey", true, "env P_KEY"]
  ])
  expect(items[1]!.label).toBe("docs (MCP ability)")
})
