import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { faker } from "@faker-js/faker"
// First, like the other API tests: the app sets up zod-openapi before any route module loads.
import "../../src/app"
import { pool } from "../../src/core/db"
import { env } from "../../src/core/env"
import { createCloudTelegramDriver, type TelegramButton } from "../../src/features/telegram/driver"
import { abilityService, marketplaceService, secretService } from "../../src/services"
import { signUpAndSignIn } from "./helpers"

// Unique per run, so the assertions only look at this file's rows even on a shared dev database.
const tag = faker.string.alphanumeric(6).toLowerCase()
const skills = Array.from({ length: 9 }, (_, i) => `s${i}-${tag}`)
const keyless = `keyless-${tag}`
const keyed = `keyed-${tag}`
const persona = `persona-${tag}`
const LINKED = 3001
const STRANGER = 3002

/** A marketplace folder with nine skills, a persona and two HTTP tools (one needs a key), minus any in `leave`. */
function marketplace(base: string, leave: string[] = []) {
  const root = mkdtempSync(join(base, "mp-"))
  const put = (rel: string, content: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), content)
  }
  for (const name of skills)
    put(`skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: Skill ${name}.\n---\nBody\n`)
  const tool = (name: string, auth = "") =>
    `name = "${name}"\ndescription = "Tool ${name}"\nbaseUrl = "https://api.${name}.test"\n${auth}` +
    `[[tools]]\nname = "${name.replaceAll("-", "_")}"\ndescription = "x"\npath = "/"\n`
  put(`personas/${persona}.toml`, 'label = "Test persona"\n')
  if (!leave.includes(keyless)) put(`tools/${keyless}.toml`, tool(keyless))
  put(`tools/${keyed}.toml`, tool(keyed, `auth = { type = "apiKey", in = "header", name = "X-Key" }\n`))
  return root
}

describe("the cloud bot's /abilities", () => {
  let base: string
  let userId: string
  const sent: { id: number; text: string; rows?: TelegramButton[][] }[] = []
  const edits: { id: number; text: string; rows?: TelegramButton[][] }[] = []
  const driver = createCloudTelegramDriver({
    resolveLinkedUserId: async telegramUserId => (telegramUserId === LINKED ? userId : undefined),
    sender: {
      async sendMessage(_chatId, text, rows) {
        sent.push({ id: sent.length + 1, text, rows })
        return { messageId: sent.length }
      },
      async editMessageText(_chatId, messageId, text, rows) {
        edits.push({ id: messageId, text, rows })
      }
    }
  })
  /** The label of the button for `name` in the latest version of the list. */
  const button = (name: string): TelegramButton | undefined =>
    (edits.at(-1)?.rows ?? list().rows ?? []).flat().find(b => b.text.includes(` ${name} `))
  const list = () => sent.findLast(message => message.text.startsWith("<b>Abilities</b>"))!
  const tap = (name: string, as = LINKED) => driver.handleCallback(as, 1, list().id, button(name)!.data)
  const enabled = async () => (await abilityService.listForUser(userId)).map(ability => ability.name)

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), "kaja-telegram-abilities-test-"))
    const email = faker.internet.email().toLowerCase()
    await signUpAndSignIn(email, faker.internet.password({ length: 8, prefix: "P4$s" }), "Tg")
    userId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [email])).rows[0].id
    secretService.setKey(Buffer.alloc(32, 5).toString("base64"))
    await marketplaceService.syncFromDir(marketplace(base), "tg1")
  })

  afterAll(async () => {
    secretService.setKey(env.USER_SECRET_KEY)
    await pool.query("DELETE FROM ability WHERE name LIKE $1", [`%-${tag}`])
    // The sync above marked the real marketplace's abilities removed; forget the stored commit so the next real sync re-applies it.
    await pool.query("DELETE FROM marketplace_sync")
    rmSync(base, { recursive: true, force: true })
  })

  test("lists the catalog as buttons, skills then personas then tools, with a key marker, a web link and pages", async () => {
    await driver.handleMessage(LINKED, 1, "/abilities@kaja_bot")
    const first = list()
    expect(first.text).toContain("/abilities")
    expect(first.text).toContain("Page 1 of 2")
    const labels = first.rows!.flat().map(b => b.text)
    expect(labels.slice(0, 8)).toEqual(skills.slice(0, 8).map(name => `▫️ ${name} · skill`))
    expect(labels.at(-1)).toBe("Next ›")

    await driver.handleCallback(LINKED, 1, first.id, "abilitypage:1")
    const second = edits.at(-1)!
    expect(second.text).toContain("Page 2 of 2")
    expect(second.rows!.flat().map(b => b.text)).toEqual([
      `▫️ ${skills[8]} · skill`,
      `▫️ ${persona} · persona`,
      `🔑 ${keyed} · tool`,
      `▫️ ${keyless} · tool`,
      "‹ Previous"
    ])
  })

  test("a tap turns an ability on or off for the user who tapped, and redraws the list", async () => {
    await tap(keyless)
    expect(await enabled()).toContain(keyless)
    expect(button(keyless)!.text).toBe(`✅ ${keyless} · tool`)
    expect(edits.at(-1)!.text).toContain("Page 2 of 2")

    await tap(keyless)
    expect(await enabled()).not.toContain(keyless)
    expect(button(keyless)!.text).toBe(`▫️ ${keyless} · tool`)
  })

  test("a persona toggles like any other ability", async () => {
    await tap(persona)
    expect(await enabled()).toContain(persona)
    expect(button(persona)!.text).toBe(`✅ ${persona} · persona`)
    await tap(persona)
    expect(await enabled()).not.toContain(persona)
  })

  test("someone who isn't linked can't change anything", async () => {
    await tap(keyless, STRANGER)
    expect(sent.at(-1)!.text).toContain("isn't linked")
    expect(await enabled()).not.toContain(keyless)
  })

  test("an ability that needs a key points to the web instead of asking for it here", async () => {
    await tap(keyed)
    expect(sent.at(-1)!.text).toContain(`${keyed}</b> needs your API key`)
    expect(sent.at(-1)!.text).toContain("/abilities?tab=tools")
    expect(await enabled()).not.toContain(keyed)

    await secretService.set(userId, `ability:${keyed}`, "a-key")
    await driver.handleMessage(LINKED, 1, "/abilities")
    await driver.handleCallback(LINKED, 1, list().id, "abilitypage:1")
    expect(button(keyed)!.text).toBe(`▫️ ${keyed} · tool`)
    await tap(keyed)
    expect(await enabled()).toContain(keyed)
  })

  test("an ability that left the marketplace shows as gone, and a tap turns it off", async () => {
    await tap(keyless)
    await marketplaceService.syncFromDir(marketplace(base, [keyless]), "tg2")
    await driver.handleMessage(LINKED, 1, "/abilities")
    await driver.handleCallback(LINKED, 1, list().id, "abilitypage:1")
    expect(button(keyless)!.text).toBe(`⚠️ ${keyless} · tool`)
    await tap(keyless)
    expect(await enabled()).not.toContain(keyless)
    expect(button(keyless)).toBeUndefined()
  })
})
