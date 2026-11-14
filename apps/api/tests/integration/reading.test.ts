import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { modules } from "@kaja/modules"
import { type Tool, toolName } from "@kaja/nasi"
import { app } from "../../src/app"
import { sql } from "../../src/core/db"
import { setNasiChatResolver, setNasiEgressOverride } from "../../src/features/nasi/chat"
import { cleanupModel, seedModel, signUpAndSignIn } from "./helpers"

const PROSE = "Agents plan, act and check their own work before they answer. ".repeat(40)
const page = (title: string) =>
  `<html><head><title>${title}</title><meta property="og:site_name" content="Example Blog"></head>
   <body><article><h1>${title}</h1><p>${PROSE}</p></article></body></html>`

/** The web as the module sees it: pages by URL; anything else is a 404. A sender, so no address is resolved. */
function fakeWeb(pages: Record<string, string>) {
  const fetched: string[] = []
  const send = async (url: string | URL) => {
    fetched.push(String(url))
    const html = pages[String(url)]
    if (html === undefined) return new Response("gone", { status: 404 })
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })
  }
  return { send, fetched, pages }
}

describe("reading module", () => {
  let token: string
  let userId: string
  let otherId: string
  const emails = [faker.internet.email().toLowerCase(), faker.internet.email().toLowerCase()]
  const web = fakeWeb({
    "https://blog.example/agents": page("How agents work"),
    "https://blog.example/memory": page("Memory for agents")
  })

  const toolsFor = (user: string) => {
    const tools = modules.find(module => module.id === "reading")!.tools({ sql, userId: user, send: web.send })
    const byName = new Map(tools.map((tool: Tool) => [toolName(tool), tool]))
    return (name: string, args: object = {}) => {
      const tool = byName.get(name)!
      // As run() does: the model's arguments go through the tool's schema first (defaults included).
      return tool.execute(tool.schema!.parse(args)) as Promise<string>
    }
  }
  const row = async (user: string, number: number) => {
    const rows = await sql<Record<string, unknown>[]>`
      SELECT * FROM reading_article WHERE user_id = ${user} AND number = ${number}`
    return rows[0]!
  }

  beforeAll(async () => {
    token = await signUpAndSignIn(emails[0]!, "Reader")
    await signUpAndSignIn(emails[1]!, "Other")
    userId = (await sql`SELECT id FROM "user" WHERE email = ${emails[0]!}`)[0].id
    otherId = (await sql`SELECT id FROM "user" WHERE email = ${emails[1]!}`)[0].id
  })

  afterAll(async () => {
    setNasiChatResolver(undefined)
    setNasiEgressOverride(undefined)
    // Their articles go with them (ON DELETE CASCADE).
    await sql`DELETE FROM "user" WHERE email IN ${sql(emails)}`
  })

  test("saving a link keeps its page: title, site and text, under the account's next number", async () => {
    const call = toolsFor(userId)
    expect(await call("save_article", { url: "https://blog.example/agents", note: "for the planner" })).toBe(
      "Saved as #1: How agents work (Example Blog, 2 min)."
    )
    expect(await call("save_article", { url: "https://blog.example/memory" })).toStartWith("Saved as #2: Memory")
    const saved = await row(userId, 1)
    expect(saved).toMatchObject({
      url: "https://blog.example/agents",
      url_key: "blog.example/agents",
      title: "How agents work",
      site: "Example Blog",
      note: "for the planner",
      source: "saved",
      status: "inbox",
      fetch_error: null
    })
    expect(saved.content).toStartWith("Agents plan, act and check")
    expect(saved.word_count).toBeGreaterThan(300)
  })

  test("the same page under another link is the article already there, with no second fetch", async () => {
    const call = toolsFor(userId)
    const before = web.fetched.length
    expect(await call("save_article", { url: "http://www.blog.example/agents/?utm_source=hn#top" })).toBe(
      "Already in the inbox as #1: How agents work"
    )
    expect(web.fetched.length).toBe(before)
    expect((await sql`SELECT COUNT(*) AS n FROM reading_article WHERE user_id = ${userId}`)[0].n).toBe("2")
  })

  test("a link that isn't a web page is refused", async () => {
    const call = toolsFor(userId)
    await expect(call("save_article", { url: "file:///etc/passwd" })).rejects.toThrow("Not a web link")
  })

  test("a page that can't be read is still saved, and saving it again reads it once it's there", async () => {
    const call = toolsFor(userId)
    const url = "https://blog.example/later"
    expect(await call("save_article", { url })).toBe(
      `Saved the link as #3, but its page couldn't be read (Fetch failed: 404 ${url}). Saving it again tries once more.`
    )
    expect(await row(userId, 3)).toMatchObject({ content: null, site: "blog.example", status: "inbox" })
    // Reading it tries the page again too
    expect(await call("read_article", { number: 3 })).toContain("its page can't be read")
    expect(await call("save_article", { url })).toContain("still can't be read")

    web.pages[url] = page("Later")
    expect(await call("save_article", { url })).toBe("#3 was saved without its page; it's read now: Later (2 min).")
    expect(await row(userId, 3)).toMatchObject({ title: "Later", fetch_error: null })
  })

  test("the list is the inbox, newest first, a page at a time", async () => {
    const call = toolsFor(userId)
    const today = new Date().toISOString().slice(0, 10)
    expect(await call("list_articles")).toBe(
      [
        "inbox: 1-3 of 3, newest first",
        `#3 Later — Example Blog, saved ${today}, 2 min`,
        `#2 Memory for agents — Example Blog, saved ${today}, 2 min`,
        `#1 How agents work — Example Blog, saved ${today}, 2 min`
      ].join("\n")
    )
    expect(await call("list_articles", { limit: 1, offset: 1 })).toBe(
      `inbox: 2-2 of 3, newest first\n#2 Memory for agents — Example Blog, saved ${today}, 2 min`
    )
    expect(await call("list_articles", { offset: 5 })).toBe("Nothing past 3 inbox articles.")
    expect(await call("list_articles", { status: "archived" })).toBe("No archived articles.")
  })

  test("reading an article returns its stored text and notes the first time it was opened", async () => {
    const call = toolsFor(userId)
    expect((await row(userId, 1)).opened_at).toBeNull()
    const text = await call("read_article", { number: 1 })
    expect(text).toStartWith(
      "# How agents work\nhttps://blog.example/agents · Example Blog · status: inbox\nThe user's note: for the planner\n\nAgents plan"
    )
    const opened = (await row(userId, 1)).opened_at
    expect(opened).toBeInstanceOf(Date)
    await call("read_article", { number: 1 })
    expect((await row(userId, 1)).opened_at).toEqual(opened)
    await expect(call("read_article", { number: 99 })).rejects.toThrow("There is no article #99.")
  })

  test("marking moves an article between inbox, read and archived; saving an archived link brings it back", async () => {
    const call = toolsFor(userId)
    expect(await call("mark_article", { numbers: [1], status: "read" })).toBe("#1 is read.")
    expect(await call("mark_article", { numbers: [2], status: "archived" })).toBe("#2 is archived.")
    expect(await row(userId, 1)).toMatchObject({ status: "read", archived_at: null })
    expect((await row(userId, 1)).read_at).toBeInstanceOf(Date)
    expect(await call("list_articles")).toStartWith("inbox: 1-1 of 1")
    expect(await call("list_articles", { status: "archived" })).toContain("#2 Memory for agents")

    const archivedAt = (await row(userId, 2)).archived_at
    expect(await call("save_article", { url: "https://blog.example/memory" })).toBe(
      "Already saved as #2 (archived), now back in the inbox: Memory for agents"
    )
    // When it was first put away stays on record.
    expect(await row(userId, 2)).toMatchObject({ status: "inbox", archived_at: archivedAt })
    expect(await call("mark_article", { numbers: [1], status: "inbox" })).toBe("#1 is back in the inbox.")
    await expect(call("mark_article", { numbers: [99], status: "read" })).rejects.toThrow("There is no article #99.")
  })

  test("each account has its own inbox and its own numbers", async () => {
    const other = toolsFor(otherId)
    expect(await other("list_articles")).toBe("The reading inbox is empty.")
    await expect(other("read_article", { number: 1 })).rejects.toThrow("There is no article #1.")
    expect(await other("save_article", { url: "https://blog.example/agents" })).toStartWith("Saved as #1:")
    expect(await toolsFor(userId)("list_articles")).toStartWith("inbox: 1-3 of 3")
  })

  test("two saves at once get two numbers", async () => {
    const call = toolsFor(otherId)
    web.pages["https://blog.example/a"] = page("A")
    web.pages["https://blog.example/b"] = page("B")
    const replies = await Promise.all(
      ["a", "b"].map(slug => call("save_article", { url: `https://blog.example/${slug}` }))
    )
    expect(replies.map(reply => reply.slice(0, 11)).sort()).toEqual(["Saved as #2", "Saved as #3"])
  })

  test("a cloud turn offers the reading tools to the default persona and runs them for the signed-in user", async () => {
    const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    setNasiEgressOverride(() => () => web.send)
    web.pages["https://blog.example/turn"] = page("Saved in a turn")
    const offered: string[][] = []
    const prompts: string[] = []
    const save = {
      id: "call_save",
      type: "function",
      function: { name: "save_article", arguments: JSON.stringify({ url: "https://blog.example/turn" }) }
    }
    const script = [{ content: null, tool_calls: [save] }, { content: "Saved." }]
    let round = 0
    const client = {
      chat: {
        completions: {
          // The module's own model call: with no summarize model in the catalog, the chat model tags
          create: async () => ({
            model: "fake-model",
            choices: [{ message: { content: '{"topics": ["AI agents"], "gist": "Saved in a turn."}' } }],
            usage: { prompt_tokens: 9, completion_tokens: 4 }
          }),
          stream: (params: { tools?: { function: { name: string } }[]; messages: { content: string }[] }) => {
            offered.push((params.tools ?? []).map(tool => tool.function.name))
            prompts.push(params.messages[0]!.content)
            const message = script[round++] ?? { content: "done" }
            return {
              async *[Symbol.asyncIterator]() {},
              finalChatCompletion: async () => ({ choices: [{ message: { role: "assistant", ...message } }] })
            }
          }
        }
      }
    }
    setNasiChatResolver(async () => ({ client: client as never, model: "fake-model" }))
    const res = await app.request("/nasi/turn", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ message: "save https://blog.example/turn" })
    })
    expect(res.status).toBe(200)
    expect(offered[0]).toEqual(
      expect.arrayContaining(["save_article", "list_articles", "read_article", "mark_article"])
    )
    expect(prompts[0]).toContain("## Reading\nThe user has a reading inbox")
    const [saved] = await sql`
      SELECT title, gist FROM reading_article WHERE user_id = ${userId} AND url_key = 'blog.example/turn'`
    expect(saved).toEqual({ title: "Saved in a turn", gist: "Saved in a turn." })
    // The tagging call counts towards the session's usage, like the summarize tool's
    const { session } = (await res.json()) as { session: string }
    const calls = await sql`
      SELECT kind, model, prompt_tokens, completion_tokens FROM nasi_model_call WHERE session_id = ${session}`
    expect(calls).toEqual([{ kind: "summarize", model: "fake-model", prompt_tokens: 9, completion_tokens: 4 }])

    // What a client shows as the starting persona's tools (the route needs a model to exist)
    const { providerId } = await seedModel("reading")
    try {
      const info = (await (await app.request("/nasi/info", { headers: auth })).json()) as { tools: string[] }
      expect(info.tools).toEqual(expect.arrayContaining(["save_article", "mark_article"]))
    } finally {
      await cleanupModel(providerId)
    }
  })
})
