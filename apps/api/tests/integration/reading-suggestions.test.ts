import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { createJobRunner, type ModuleContext, modules, moduleSettings } from "@kaja/modules"
import { type Tool, toolName } from "@kaja/nasi"
import { z } from "zod"
import { sql } from "../../src/core/db"
import { signUpAndSignIn } from "./helpers"

const reading = modules.find(module => module.id === "reading")!
const collectJob = reading.jobs!.find(job => job.scope === "global")!
const discoverJob = reading.jobs!.find(job => job.scope === "user")!

const PROSE = "Agents plan, act and check their own work before they answer. ".repeat(40)
const page = (title: string) =>
  `<html><head><title>${title} | The Blog</title></head><body><article><h1>${title}</h1><p>${PROSE}</p></article></body></html>`

type Story = { id: string; title: string; path: string; points: number }
const story = (id: string, title: string, path: string, points: number): Story => ({ id, title, path, points })

/** The web as the module sees it: the Hacker News list (`stories`), and blog.example pages except the `missing` paths. */
const web = { stories: [] as Story[], missing: new Set<string>(), listRequests: 0 }
const send = async (url: string | URL) => {
  const { hostname, pathname } = new URL(String(url))
  if (hostname === "hn.algolia.com") {
    web.listRequests += 1
    const hits = web.stories.map(each => ({
      objectID: each.id,
      title: each.title,
      url: `https://blog.example/${each.path}`,
      points: each.points,
      num_comments: 12,
      created_at_i: Math.floor(Date.now() / 1000)
    }))
    return Response.json({ hits })
  }
  if (hostname !== "blog.example" || web.missing.has(pathname.slice(1))) return new Response("gone", { status: 404 })
  return new Response(page(`Page ${pathname.slice(1)}`), { headers: { "content-type": "text/html" } })
}

type ModelRequest = { messages: { role: string; content: string }[] }

/** A model that answers the picking call with `match` and a tagging call with `tag` (an Error is thrown). */
const model = {
  match: '{"matches": []}' as string | Error,
  tag: '{"topics": ["Misc"], "gist": "What it says."}' as string | Error,
  requests: [] as ModelRequest[]
}
const client = {
  chat: {
    completions: {
      create: async (request: ModelRequest) => {
        model.requests.push(request)
        const picking = request.messages[0]!.content.startsWith("You pick stories")
        const reply = picking ? model.match : model.tag
        if (reply instanceof Error) throw reply
        return {
          model: "matcher",
          choices: [{ message: { content: reply } }],
          usage: { prompt_tokens: 10, completion_tokens: 2 }
        }
      }
    }
  }
}
const pickingRequests = () => model.requests.filter(each => each.messages[0]!.content.startsWith("You pick stories"))
const matches = (...picks: [number, string][]) => JSON.stringify({ matches: picks.map(([n, topic]) => ({ n, topic })) })

const HOUR = 60 * 60_000
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(Date.now() - ms)

describe("reading suggestions", () => {
  let userId: string
  const email = faker.internet.email().toLowerCase()
  const signal = new AbortController().signal

  const ctxFor = (user: string): ModuleContext => ({
    sql,
    userId: user,
    send,
    model: { client, model: "matcher" } as unknown as NonNullable<ModuleContext["model"]>
  })
  const call = (name: string, args: object = {}) => {
    const tools = new Map(reading.tools(ctxFor(userId)).map((tool: Tool) => [toolName(tool), tool]))
    const tool = tools.get(name)!
    return tool.execute(tool.schema!.parse(args)) as Promise<string>
  }
  const collect = () => {
    if (collectJob.scope !== "global") throw new Error("collect is a global job")
    return collectJob.run({ sql, send, signal })
  }
  const discover = () => {
    if (discoverJob.scope !== "user") throw new Error("discover is a user job")
    return discoverJob.run({ ...ctxFor(userId), signal })
  }
  const settings = () =>
    moduleSettings({ sql, userId }, "reading", z.object({ discoveredAt: z.string().optional() }).loose())
  const articles = async () =>
    [
      ...(await sql<{ number: number; title: string; status: string; source: string; topics: string | null }[]>`
        SELECT a.number, a.title, a.status, a.source,
          (SELECT string_agg(t.name, ', ' ORDER BY t.name) FROM reading_article_topic l
           JOIN reading_topic t ON t.id = l.topic_id WHERE l.article_id = a.id) AS topics
        FROM reading_article a WHERE a.user_id = ${userId} ORDER BY a.number`)
    ].map(row => `#${row.number} ${row.title} [${row.status}, ${row.source}] ${row.topics ?? "-"}`)
  const today = new Date().toISOString().slice(0, 10)

  beforeAll(async () => {
    await signUpAndSignIn(email, "Reader")
    userId = (await sql`SELECT id FROM "user" WHERE email = ${email}`)[0].id
    await sql`DELETE FROM reading_source_item`
  })

  afterAll(async () => {
    await sql`DELETE FROM reading_source_item`
    await sql`DELETE FROM "user" WHERE email = ${email}`
  })

  test("the story list is kept once per story: a later fetch refreshes its points, not when it was first seen", async () => {
    web.stories = [
      story("101", "Agents that plan", "plan", 300),
      story("102", "A faster borrow checker", "borrow", 250),
      story("103", "Agents and their memory", "memory", 200),
      story("104", "Coins go up", "coins", 150),
      story("105", "Already mine", "mine", 100)
    ]
    await collect()
    await sql`UPDATE reading_source_item SET first_seen_at = ${ago(5 * HOUR)}`
    web.stories[0]!.points = 999
    await collect()
    expect(web.listRequests).toBe(2)
    const rows = await sql`
      SELECT external_id, score, discussion_url, first_seen_at < ${ago(4 * HOUR)} AS old
      FROM reading_source_item ORDER BY external_id`
    expect(rows).toHaveLength(5)
    expect(rows[0]).toEqual({
      external_id: "101",
      score: 999,
      discussion_url: "https://news.ycombinator.com/item?id=101",
      old: true
    })
  })

  test("without a followed topic there is nothing to look for, and the job goes", async () => {
    expect(await discover()).toBe("done")
    expect(await call("find_articles")).toStartWith("The user follows no topic yet")
    expect(model.requests).toHaveLength(0)
  })

  test("stories on the followed topics become suggestions, with a gist, under topics the user already has", async () => {
    model.tag = '{"topics": ["AI agents"], "gist": "Mine."}'
    await call("save_article", { url: "https://blog.example/mine" })
    model.tag = '{"topics": ["Crypto"], "gist": "Coins."}'
    await call("save_article", { url: "https://blog.example/own-coins" })
    await call("update_topic", { topic: "AI agents", state: "followed" })
    await call("update_topic", { topic: "Crypto", state: "muted" })
    expect(await sql`SELECT job FROM module_job WHERE user_id = ${userId}`).toEqual([{ job: "discover" }])
    model.requests.length = 0

    web.missing.add("memory")
    model.match = matches([1, "ai agents"], [3, "AI agents"])
    model.tag = '{"topics": ["AI agents", "Planning ahead"], "gist": "Agents should plan first."}'
    expect(await discover()).toBeUndefined()

    const [picking] = pickingRequests()
    expect(picking!.messages[0]!.content).toContain("The reader follows these topics: AI agents.")
    expect(picking!.messages[0]!.content).toContain("The reader does not want stories about: Crypto.")
    expect(picking!.messages[0]!.content).toContain("at most 5 stories")
    // The most popular first, without the link the user saved themselves
    expect(picking!.messages[1]!.content).toBe(
      [
        "1. Agents that plan (blog.example)",
        "2. A faster borrow checker (blog.example)",
        "3. Agents and their memory (blog.example)",
        "4. Coins go up (blog.example)"
      ].join("\n")
    )
    expect(await articles()).toEqual([
      "#1 Page mine | The Blog [inbox, saved] AI agents",
      "#2 Page own-coins | The Blog [inbox, saved] Crypto",
      "#3 Agents that plan [suggested, hn] AI agents",
      "#4 Agents and their memory [suggested, hn] AI agents"
    ])
    const rows = await sql`
      SELECT number, gist, tagged_at IS NOT NULL AS tagged, fetch_error IS NOT NULL AS unread, score, discussion_url
      FROM reading_article WHERE user_id = ${userId} AND status = 'suggested' ORDER BY number`
    expect(rows).toEqual([
      {
        number: 3,
        gist: "Agents should plan first.",
        tagged: true,
        unread: false,
        score: 999,
        discussion_url: "https://news.ycombinator.com/item?id=101"
      },
      {
        number: 4,
        gist: null,
        tagged: false,
        unread: true,
        score: 200,
        discussion_url: "https://news.ycombinator.com/item?id=103"
      }
    ])
    // No topic came with the suggestions, and they don't count as the user's articles
    expect(await call("list_topics")).toBe(
      "2 topics, followed first\nAI agents — followed, 1 article (1 in the inbox)\nCrypto — muted, 1 article (1 in the inbox)"
    )
  })

  test("suggestions list apart from the inbox, which says they're waiting", async () => {
    expect(await call("list_articles", { status: "suggested" })).toBe(
      [
        "suggested: 1-2 of 2, newest first",
        `#4 Agents and their memory — blog.example, found ${today}, page couldn't be read, 200 points on Hacker News · AI agents`,
        `#3 Agents that plan — blog.example, found ${today}, 2 min, 999 points on Hacker News · AI agents`,
        "   Agents should plan first.",
        "mark_article keeps one (status inbox) or turns it down (status dismissed); untouched ones go after two weeks."
      ].join("\n")
    )
    const inbox = await call("list_articles")
    expect(inbox).toStartWith("inbox: 1-2 of 2, newest first")
    expect(inbox).toEndWith(
      "Kaja also found 2 stories for the user's topics: list_articles with status suggested shows them."
    )
    expect(await call("list_articles", { status: "all" })).toStartWith("all: 1-2 of 2")
  })

  test("a new search only looks at what arrived since the last one, and asking again has to wait an hour", async () => {
    expect(await call("find_articles")).toMatch(
      /^Kaja looked 1 min ago; the next search can run in \d+ min\. 2 earlier suggestions are waiting/
    )
    web.stories = [
      story("201", "Agents in production", "production", 90),
      story("202", "Agents at the edge", "edge", 80),
      story("203", "Agents on a budget", "budget", 70),
      story("204", "Agents in the browser", "browser", 60),
      story("205", "Gardening", "gardening", 50)
    ]
    await collect()
    await settings().set({ discoveredAt: ago(2 * HOUR).toISOString() })
    model.requests.length = 0
    model.match = matches([1, "AI agents"], [2, "AI agents"], [3, "AI agents"], [4, "AI agents"])
    model.tag = '{"topics": ["AI agents"], "gist": "More agents."}'

    // Five a day at most: two were found before, so three of the four picks stay
    const found = await call("find_articles")
    expect(found).toStartWith("Found 3 new stories:\n#7 Agents on a budget")
    expect(found).toContain("\n   More agents.")
    const [picking] = pickingRequests()
    expect(picking!.messages[0]!.content).toContain("at most 3 stories")
    expect(picking!.messages[1]!.content).toStartWith("1. Agents in production (blog.example)\n2. Agents at the edge")
    expect(picking!.messages[1]!.content).not.toContain("borrow checker")

    await settings().set({ discoveredAt: ago(2 * HOUR).toISOString() })
    model.requests.length = 0
    expect(await call("find_articles")).toStartWith("Kaja already found 5 stories in the last day")
    expect(model.requests).toHaveLength(0)
  })

  test("a search that fails says so in a turn and leaves the job to try again", async () => {
    await sql`UPDATE reading_article SET saved_at = ${ago(2 * DAY)} WHERE user_id = ${userId} AND source = 'hn'`
    web.stories = [story("301", "Agents, again", "again", 500)]
    await collect()
    model.match = new Error("the model is down")
    const before = (await settings().get()).discoveredAt
    expect(await call("find_articles")).toStartWith("The search couldn't run just now.")
    await expect(discover()).rejects.toThrow("the model is down")
    model.match = "I'd rather not."
    await expect(discover()).rejects.toThrow("named no stories in a usable form")
    expect((await settings().get()).discoveredAt).toBe(before)

    model.match = '{"matches": []}'
    expect(await call("find_articles")).toStartWith("Nothing new about the followed topics since the last search.")
    expect((await settings().get()).discoveredAt).not.toBe(before)
  })

  test("a suggestion is kept, read or turned down; a saved article can't be dismissed", async () => {
    expect(await call("mark_article", { numbers: [5, 6], status: "dismissed" })).toBe("#5 and #6 are dismissed.")
    await expect(call("mark_article", { numbers: [1], status: "dismissed" })).rejects.toThrow(
      "Only a suggestion can be dismissed (a saved article is archived instead): #1 isn't one."
    )
    expect(await call("mark_article", { numbers: [7, 99], status: "inbox" })).toBe(
      "#7 is back in the inbox. There is no article #99."
    )

    // Reading one keeps it
    const read = await call("read_article", { number: 3 })
    expect(read).toStartWith("#3 was a suggestion; it's in the inbox now.\n\n# Agents that plan\n")
    expect(read).toContain("status: inbox")
    expect(read).toContain("Found on Hacker News, discussed at https://news.ycombinator.com/item?id=101")

    // One whose page couldn't be read stays a suggestion until it can
    expect(await call("read_article", { number: 4 })).toContain("its page can't be read")
    web.missing.clear()
    model.tag = '{"topics": ["AI agents", "Memory"], "gist": "Agents remember."}'
    expect(await call("read_article", { number: 4 })).toStartWith("#4 was a suggestion; it's in the inbox now.")
    expect(await articles()).toEqual([
      "#1 Page mine | The Blog [inbox, saved] AI agents",
      "#2 Page own-coins | The Blog [inbox, saved] Crypto",
      "#3 Agents that plan [inbox, hn] AI agents",
      "#4 Agents and their memory [inbox, hn] AI agents, Memory",
      "#5 Agents in production [dismissed, hn] AI agents",
      "#6 Agents at the edge [dismissed, hn] AI agents",
      "#7 Agents on a budget [inbox, hn] AI agents"
    ])
    expect(await call("list_articles", { status: "suggested" })).toStartWith("No suggestions are waiting.")
    // What Kaja found and the user turned down is not saved again as new
    expect(await call("save_article", { url: "https://blog.example/edge" })).toStartWith(
      "Kaja had found it already, as #6; now in the inbox: Agents at the edge"
    )
  })

  test("the job's model calls are counted, and it leaves once suggestions are switched off", async () => {
    await sql`UPDATE reading_article SET saved_at = ${ago(2 * DAY)} WHERE user_id = ${userId} AND source = 'hn'`
    web.stories = [story("401", "Agents everywhere", "everywhere", 500)]
    await collect()
    // First in line, whatever other accounts' jobs are due
    await sql`UPDATE module_job SET due_at = ${ago(365 * DAY)} WHERE user_id = ${userId}`
    model.match = matches([1, "AI agents"])
    model.tag = '{"topics": ["AI agents"], "gist": "Everywhere."}'
    const runner = createJobRunner({
      sql,
      modules: async () => [{ ...reading, jobs: [discoverJob] }],
      userContext: async id => ctxFor(id),
      globalSend: send
    })
    await runner.tick()
    expect((await articles()).at(-1)).toBe("#8 Agents everywhere [suggested, hn] AI agents")
    const calls = await sql`
      SELECT module, job, model, prompt_tokens FROM module_model_call WHERE user_id = ${userId} ORDER BY id`
    const counted = { module: "reading", job: "discover", model: "matcher", prompt_tokens: 10 }
    expect(calls).toEqual([counted, counted])
    const [row] = await sql`SELECT last_error, due_at > ${new Date(Date.now() + 23 * HOUR)} AS tomorrow FROM module_job
      WHERE user_id = ${userId}`
    expect(row).toEqual({ last_error: null, tomorrow: true })

    expect(await call("update_reading_settings", { suggestions: false })).toStartWith(
      "Kaja no longer looks for stories"
    )
    expect(await call("find_articles")).toStartWith("Suggestions are switched off")
    await sql`UPDATE module_job SET due_at = ${ago(365 * DAY)} WHERE user_id = ${userId}`
    await runner.tick()
    expect(await sql`SELECT 1 FROM module_job WHERE user_id = ${userId}`).toHaveLength(0)
    expect(await call("update_reading_settings", { suggestions: true })).toBe(
      "Kaja looks for stories about the followed topics again."
    )
    expect(await sql`SELECT job FROM module_job WHERE user_id = ${userId}`).toEqual([{ job: "discover" }])
  })

  test("a suggestion nobody looked at goes after two weeks, with the list entries older than a week", async () => {
    await sql`UPDATE reading_article SET saved_at = ${ago(15 * DAY)} WHERE user_id = ${userId} AND number IN (5, 8)`
    await sql`UPDATE reading_source_item SET first_seen_at = ${ago(8 * DAY)} WHERE external_id <> '401'`
    web.stories = []
    await collect()
    // #8 was still a suggestion; #5 was dismissed, which is remembered
    expect((await articles()).map(line => line.split(" ")[0])).toEqual(["#1", "#2", "#3", "#4", "#5", "#6", "#7"])
    expect(await sql`SELECT external_id FROM reading_source_item`).toEqual([{ external_id: "401" }])
  })
})
