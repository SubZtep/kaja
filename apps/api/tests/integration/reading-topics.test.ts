import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { type ModuleContext, modules, moduleSettings } from "@kaja/modules"
import { type Tool, toolName } from "@kaja/nasi"
import { z } from "zod"
import { sql } from "../../src/core/db"
import { signUpAndSignIn } from "./helpers"

const PROSE = "Agents plan, act and check their own work before they answer. ".repeat(40)
const page = (title: string) =>
  `<html><head><title>${title}</title></head><body><article><h1>${title}</h1><p>${PROSE}</p></article></body></html>`

// Every blog.example page exists, titled by its path; anything else is a 404.
const send = async (url: string | URL) => {
  const { hostname, pathname } = new URL(String(url))
  if (hostname !== "blog.example") return new Response("gone", { status: 404 })
  return new Response(page(`About ${pathname.slice(1)}`), { headers: { "content-type": "text/html" } })
}

type TaggingRequest = { messages: { role: string; content: string }[] }

/** A tagging model that answers with `next` (set per test; an Error is thrown), keeping what it was asked. */
function taggingModel() {
  const state: { next: string | Error; requests: TaggingRequest[] } = { next: '{"topics": ["Misc"]}', requests: [] }
  const client = {
    chat: {
      completions: {
        create: async (request: TaggingRequest) => {
          state.requests.push(request)
          if (state.next instanceof Error) throw state.next
          return { model: "tagger", choices: [{ message: { content: state.next } }], usage: {} }
        }
      }
    }
  }
  return { state, model: { client, model: "tagger" } as unknown as NonNullable<ModuleContext["model"]> }
}

const tagged = (topics: string[], gist = "What it says.") => JSON.stringify({ topics, gist })

describe("reading topics", () => {
  let userId: string
  let otherId: string
  const emails = [faker.internet.email().toLowerCase(), faker.internet.email().toLowerCase()]
  const tagger = taggingModel()

  const toolsFor = (user: string, model: ModuleContext["model"] = tagger.model) => {
    const reading = modules.find(module => module.id === "reading")!
    const tools = reading.tools({ sql, userId: user, send, model, language: "hu-HU" })
    const byName = new Map(tools.map((tool: Tool) => [toolName(tool), tool]))
    return (name: string, args: object = {}) => {
      const tool = byName.get(name)!
      return tool.execute(tool.schema!.parse(args)) as Promise<string>
    }
  }
  const save = (slug: string, topics: string[]) => {
    tagger.state.next = tagged(topics)
    return toolsFor(userId)("save_article", { url: `https://blog.example/${slug}` })
  }
  const topicRows = async (): Promise<{ name: string; state: string; offered: boolean }[]> => [
    ...(await sql<{ name: string; state: string; offered: boolean }[]>`
      SELECT name, state, offered_at IS NOT NULL AS offered FROM reading_topic WHERE user_id = ${userId} ORDER BY name`)
  ]
  const topicsOfArticle = async (number: number) =>
    (
      await sql<{ name: string }[]>`
        SELECT t.name FROM reading_article_topic l
        JOIN reading_topic t ON t.id = l.topic_id JOIN reading_article a ON a.id = l.article_id
        WHERE a.user_id = ${userId} AND a.number = ${number} ORDER BY t.name`
    ).map(row => row.name)

  beforeAll(async () => {
    await signUpAndSignIn(emails[0]!, "Reader")
    await signUpAndSignIn(emails[1]!, "Other")
    userId = (await sql`SELECT id FROM "user" WHERE email = ${emails[0]!}`)[0].id
    otherId = (await sql`SELECT id FROM "user" WHERE email = ${emails[1]!}`)[0].id
  })

  afterAll(async () => {
    await sql`DELETE FROM "user" WHERE email IN ${sql(emails)}`
  })

  test("a saved article gets its topics and gist, and the reply says them", async () => {
    expect(await save("one", ["AI agents", "Planning"])).toBe(
      "Saved as #1: About one (blog.example, 2 min).\nTopics: AI agents, Planning.\nGist: What it says."
    )
    const [system, user] = tagger.state.requests.at(-1)!.messages
    expect(system!.content).toContain("in Hungarian.")
    expect(user!.content).toStartWith("Existing topics: none yet\nTitle: About one\nSite: blog.example\n\nAgents plan")
    const [row] = await sql`SELECT gist, tagged_at FROM reading_article WHERE user_id = ${userId} AND number = 1`
    expect(row).toMatchObject({ gist: "What it says." })
    expect(row.tagged_at).toBeInstanceOf(Date)
    expect(await topicRows()).toEqual([
      { name: "AI agents", state: "neutral", offered: false },
      { name: "Planning", state: "neutral", offered: false }
    ])
  })

  test("the model is shown the user's topics, and one it spells differently stays the same topic", async () => {
    expect(await save("two", ["ai  AGENTS"])).toContain("\nTopics: AI agents.")
    expect(tagger.state.requests.at(-1)!.messages[1]!.content).toStartWith("Existing topics: AI agents, Planning\n")
    expect((await topicRows()).map(topic => topic.name)).toEqual(["AI agents", "Planning"])
  })

  test("a topic's third article brings the offer to follow it, once", async () => {
    const third = await save("three", ["AI agents"])
    expect(third).toContain('"AI agents" now has 3 saved articles and isn\'t followed. Ask the user once')
    expect((await topicRows())[0]).toEqual({ name: "AI agents", state: "neutral", offered: true })
    expect(await save("four", ["AI agents"])).toBe(
      "Saved as #4: About four (blog.example, 2 min).\nTopics: AI agents.\nGist: What it says."
    )
  })

  test("articles list by topic across statuses, each line with its topics", async () => {
    const call = toolsFor(userId)
    await call("mark_article", { number: 2, status: "read" })
    const today = new Date().toISOString().slice(0, 10)
    expect(await call("list_articles", { topic: "ai agents", status: "all", limit: 2 })).toBe(
      [
        'all on "AI agents": 1-2 of 4, newest first',
        `#4 About four — blog.example, saved ${today}, 2 min, inbox · AI agents`,
        `#3 About three — blog.example, saved ${today}, 2 min, inbox · AI agents`
      ].join("\n")
    )
    expect(await call("list_articles", { topic: "Planning" })).toBe(
      `inbox on "Planning": 1-1 of 1, newest first\n#1 About one — blog.example, saved ${today}, 2 min · AI agents, Planning`
    )
    expect(await call("list_articles", { topic: "Planning", status: "archived" })).toBe(
      'No archived articles on "Planning".'
    )
    await expect(call("list_articles", { topic: "Nope" })).rejects.toThrow('There is no topic called "Nope".')
    expect(await call("read_article", { number: 1 })).toStartWith(
      "# About one\nhttps://blog.example/one · blog.example · status: inbox\nTopics: AI agents, Planning\n\nAgents plan"
    )
  })

  test("topics list with their counts, followed first; following or muting one is remembered", async () => {
    const call = toolsFor(userId)
    expect(await call("list_topics")).toBe(
      "2 topics, followed first\nAI agents — 4 articles (3 in the inbox)\nPlanning — 1 article (1 in the inbox)"
    )
    expect(await call("update_topic", { topic: "planning", state: "followed" })).toBe('"Planning" is followed.')
    expect(await call("update_topic", { topic: "AI agents", state: "muted" })).toBe('"AI agents" is muted.')
    expect(await call("list_topics")).toBe(
      "2 topics, followed first\nPlanning — followed, 1 article (1 in the inbox)\nAI agents — muted, 4 articles (3 in the inbox)"
    )
    // Deciding about a topic by hand counts as the offer.
    expect((await topicRows()).map(topic => topic.offered)).toEqual([true, true])
    expect(await call("update_topic", { topic: "AI agents", state: "neutral" })).toBe(
      '"AI agents" is neither followed nor muted.'
    )
    await expect(call("update_topic", { topic: "Planning" })).rejects.toThrow("Give a state, a new name")
  })

  test("a topic can be renamed, but not onto another's name", async () => {
    const call = toolsFor(userId)
    expect(await call("update_topic", { topic: "Planning", rename: "  Task   planning " })).toBe(
      '"Planning" is now "Task planning".'
    )
    await expect(call("update_topic", { topic: "Task planning", rename: "ai agents" })).rejects.toThrow(
      'There is already a topic called "AI agents": merge into it with merge_into.'
    )
    // Its own name in another case is only a respelling
    expect(await call("update_topic", { topic: "AI agents", rename: "AI Agents" })).toBe(
      '"AI agents" is now "AI Agents".'
    )
    expect((await topicRows()).map(topic => topic.name)).toEqual(["AI Agents", "Task planning"])
  })

  test("merging moves a topic's articles to another, without doubling the ones that had both", async () => {
    const call = toolsFor(userId)
    await expect(call("update_topic", { topic: "AI Agents", merge_into: "ai agents" })).rejects.toThrow("into itself")
    expect(await call("update_topic", { topic: "Task planning", merge_into: "AI Agents" })).toBe(
      '"Task planning" is merged into "AI Agents".'
    )
    expect(await topicsOfArticle(1)).toEqual(["AI Agents"])
    expect(await call("list_topics")).toBe("1 topic\nAI Agents — 4 articles (3 in the inbox)")
  })

  test("an article's topics can be set by hand; an unfollowed topic left without articles goes", async () => {
    const call = toolsFor(userId)
    expect(await call("mark_article", { number: 4, topics: ["Rust", " ai agents "] })).toBe(
      "#4's topics are now: AI Agents, Rust."
    )
    expect(await call("mark_article", { number: 4, topics: ["AI Agents"], status: "archived" })).toBe(
      "#4's topics are now: AI Agents. #4 is archived."
    )
    expect((await topicRows()).map(topic => topic.name)).toEqual(["AI Agents"])
    // The gist written with the first tagging stays
    expect((await sql`SELECT gist FROM reading_article WHERE user_id = ${userId} AND number = 4`)[0].gist).toBe(
      "What it says."
    )
    await expect(call("mark_article", { number: 99, topics: ["Rust"] })).rejects.toThrow("There is no article #99.")
    await expect(call("mark_article", { number: 4 })).rejects.toThrow("Give a status, topics, or both.")
  })

  test("an article the model couldn't tag is saved all the same, and tagged when it's saved again", async () => {
    tagger.state.next = new Error("503")
    expect(await toolsFor(userId)("save_article", { url: "https://blog.example/five" })).toBe(
      "Saved as #5: About five (blog.example, 2 min)."
    )
    expect(
      (await sql`SELECT tagged_at FROM reading_article WHERE user_id = ${userId} AND number = 5`)[0].tagged_at
    ).toBeNull()
    expect(await save("five", ["Rust"])).toBe(
      "Already in the inbox as #5: About five\nTopics: Rust.\nGist: What it says."
    )
    // Tagged now, so another save asks no model
    const asked = tagger.state.requests.length
    expect(await save("five", ["Other"])).toBe("Already in the inbox as #5: About five\nTopics: Rust.")
    expect(tagger.state.requests.length).toBe(asked)
  })

  test("a link on its own asks once what to do; the answer is remembered for the account", async () => {
    const call = toolsFor(userId)
    tagger.state.next = tagged(["Rust"])
    expect(await call("link_received", { url: "https://blog.example/six" })).toContain("Ask them once with ask_user")
    expect((await sql`SELECT COUNT(*) AS n FROM reading_article WHERE user_id = ${userId}`)[0].n).toBe("5")

    const read = await call("link_received", { url: "https://blog.example/six", choice: "read" })
    expect(read).toStartWith(
      "Kept as #6 (read, not in the inbox): About six (blog.example, 2 min).\nTopics: Rust.\nGist: What it says.\n" +
        "The user wants to read it now: tell them what it says.\n\n# About six\nhttps://blog.example/six · blog.example · status: read\nTopics: Rust\n\nAgents plan"
    )
    const [six] =
      await sql`SELECT status, read_at, opened_at FROM reading_article WHERE user_id = ${userId} AND number = 6`
    expect(six.status).toBe("read")
    expect(six.read_at).toBeInstanceOf(Date)
    expect(six.opened_at).toBeInstanceOf(Date)

    // No question the next time, on any channel of the account
    expect(await call("link_received", { url: "https://blog.example/seven" })).toStartWith("Kept as #7 (read")
    // An inbox article sent as a bare link is read now
    expect(await call("link_received", { url: "https://blog.example/five" })).toStartWith(
      "Already saved as #5, now marked read: About five"
    )
    expect(await toolsFor(otherId)("link_received", { url: "https://blog.example/six" })).toContain("Ask them once")
  })

  test("the link preference can be changed by asking", async () => {
    const call = toolsFor(userId)
    expect(await call("set_link_preference", { preference: "save" })).toBe(
      "Links sent on their own are saved to the inbox from now on."
    )
    expect(await call("link_received", { url: "https://blog.example/eight" })).toStartWith("Saved as #8: About eight")
    expect(await call("set_link_preference", { preference: "ask" })).toBe(
      "The next link sent on its own asks what to do with it."
    )
    expect(await call("link_received", { url: "https://blog.example/nine" })).toContain("Ask them once")
    await expect(call("link_received", { url: "not a link" })).rejects.toThrow("Not a web link")
  })
})

describe("module settings", () => {
  const email = faker.internet.email().toLowerCase()
  const Schema = z.object({ mode: z.enum(["a", "b"]).default("a"), hour: z.int().default(8) })
  let userId: string
  let otherId: string
  const otherEmail = faker.internet.email().toLowerCase()

  beforeAll(async () => {
    await signUpAndSignIn(email, "Settings")
    await signUpAndSignIn(otherEmail, "Other")
    userId = (await sql`SELECT id FROM "user" WHERE email = ${email}`)[0].id
    otherId = (await sql`SELECT id FROM "user" WHERE email = ${otherEmail}`)[0].id
  })

  afterAll(async () => {
    await sql`DELETE FROM "user" WHERE email IN ${sql([email, otherEmail])}`
  })

  test("an account without a row has the defaults; a saved field is merged over what's there", async () => {
    const settings = moduleSettings({ sql, userId }, "probe", Schema)
    expect(await settings.get()).toEqual({ mode: "a", hour: 8 })
    expect((await sql`SELECT 1 FROM module_user WHERE user_id = ${userId}`).length).toBe(0)
    expect(await settings.set({ mode: "b" })).toEqual({ mode: "b", hour: 8 })
    expect(await settings.set({ hour: 20 })).toEqual({ mode: "b", hour: 20 })
    expect(await settings.get()).toEqual({ mode: "b", hour: 20 })
  })

  test("settings are one account's and one module's", async () => {
    expect(await moduleSettings({ sql, userId: otherId }, "probe", Schema).get()).toEqual({ mode: "a", hour: 8 })
    expect(await moduleSettings({ sql, userId }, "another", Schema).get()).toEqual({ mode: "a", hour: 8 })
  })

  test("stored settings the schema no longer takes read as the defaults", async () => {
    await sql`UPDATE module_user SET settings = ${sql.json({ mode: "gone" })} WHERE user_id = ${userId} AND module = 'probe'`
    expect(await moduleSettings({ sql, userId }, "probe", Schema).get()).toEqual({ mode: "a", hour: 8 })
  })
})
