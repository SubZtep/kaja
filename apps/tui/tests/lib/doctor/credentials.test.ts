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

test("an unreachable service is reported without asking for a key", async () => {
  // Ollama isn't running: nothing judged a credential, so there is nothing for the user to retype.
  const down = fakeItem({
    present: false,
    required: false,
    check: async () => ({ ok: false, reason: "Connection error.", kind: "unreachable" })
  })
  const { io: prompts, titles } = io(["should-never-be-asked"])
  const outcomes = await resolveCredentials([down.item], prompts)

  expect(titles).toEqual([])
  expect(down.saved).toEqual([])
  expect(outcomes[0]).toMatchObject({ status: "failing", kind: "unreachable" })
})

test("the to-do list separates unreachable services from keys to set", async () => {
  const badKey = fakeItem({ present: true, works: () => false })
  const down = fakeItem({
    label: "ollama (model provider)",
    present: false,
    required: false,
    check: async () => ({ ok: false, reason: "Connection error.", kind: "unreachable" })
  })
  const outcomes = await resolveCredentials([badKey.item, down.item], { ...io([]).io, interactive: false })

  expect(summaryLines(outcomes, "/x/secrets.toml")).toEqual([
    "Still to fix, in /x/secrets.toml:",
    "  [thing] key: rejected",
    "Couldn't be reached — check the service is running and its URL in models.toml:",
    "  ollama (model provider): Connection error.",
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

test("a value the wizard collected is tested and saved without asking again", async () => {
  const item = fakeItem({ works: value => value === "good" })
  const prompts = io([])
  const outcomes = await resolveCredentials([item.item], prompts.io, () => {}, { "[thing] key": "good" })

  expect(outcomes[0]!.status).toBe("saved")
  expect(item.saved).toEqual(["good"])
  expect(prompts.titles).toEqual([])
})

test("a collected value that fails is kept only when the user says so", async () => {
  const declined = fakeItem({ works: () => false })
  const refused = await resolveCredentials([declined.item], io([], false).io, () => {}, { "[thing] key": "bad" })
  expect(refused[0]!.status).toBe("missing")
  expect(declined.saved).toEqual([])

  const accepted = fakeItem({ works: () => false })
  const kept = await resolveCredentials([accepted.item], io([], true).io, () => {}, { "[thing] key": "bad" })
  expect(kept[0]!.status).toBe("saved-failing")
  expect(accepted.saved).toEqual(["bad"])
})

test("null means the caller already asked and was turned down, so the pass doesn't ask twice", async () => {
  const item = fakeItem({ works: () => true })
  const prompts = io(["would-be-answered"])
  const outcomes = await resolveCredentials([item.item], prompts.io, () => {}, { "[thing] key": null })

  expect(outcomes[0]!.status).toBe("missing")
  expect(prompts.titles).toEqual([])
  expect(item.saved).toEqual([])
})

test("collects providers, keyed abilities, declared MCP secrets and a saved Telegram token", async () => {
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
  put("secrets.toml", `[mcp.ctx]\nCTX_KEY = "k"\n\n[telegram]\nbotToken = "t"\n\n[webSearch]\napiKey = "b"\n`)

  const items = await collectCredentials()
  expect(items.map(i => [i.where, i.present, i.required, i.hint])).toEqual([
    ["[providers.local] api_key", false, false, undefined],
    ["[abilities.gh] apiKey", false, true, "header Authorization"],
    ["[mcp.ctx] CTX_KEY", true, true, "env CTX_KEY"],
    ["[mcp.ctx] CTX_ID", false, true, "env CTX_ID"],
    ["[telegram] botToken", true, true, undefined],
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
  put("secrets.toml", "")

  const items = await collectCredentials()
  expect(items.map(i => [i.where, i.required, i.hint])).toEqual([
    ["[abilities.weather] apiKey", false, "query key"],
    ["[abilities.docs] apiKey", false, "header Authorization"],
    ["[abilities.private] apiKey", true, "env P_KEY"]
  ])
  expect(items[1]!.label).toBe("docs (MCP ability)")
})
