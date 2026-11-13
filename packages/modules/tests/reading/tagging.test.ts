import { afterEach, expect, test } from "bun:test"
import { setWarnHandler } from "@kaja/nasi"
import type { ModuleModel } from "../../src/contract"
import { assignTopics, parseTagging } from "../../src/reading/tagging"

afterEach(() => setWarnHandler(() => {}))

type Request = { model: string; messages: { role: string; content: string }[] }

/** A model that answers every request with `reply` (or throws it), keeping what it was asked. */
function fakeModel(reply: string | Error) {
  const requests: Request[] = []
  const client = {
    chat: {
      completions: {
        create: async (request: Request) => {
          requests.push(request)
          if (reply instanceof Error) throw reply
          return {
            model: "tagger-served",
            choices: [{ message: { content: reply } }],
            usage: { prompt_tokens: 11, completion_tokens: 5 }
          }
        }
      }
    }
  }
  return { requests, model: { client, model: "tagger" } as unknown as ModuleModel }
}

const article = { title: "How agents work", site: "Example Blog", content: "Agents plan and act. ".repeat(2000) }

test("a reply is its topics and gist, wherever the JSON sits in it", () => {
  expect(
    parseTagging('Sure!\n```json\n{"topics": ["AI agents", " Tool   use "], "gist": " Agents  plan. "}\n```', [])
  ).toEqual({ topics: ["AI agents", "Tool use"], gist: "Agents plan." })
  expect(parseTagging('{"topics": ["AI agents"]}', [])).toEqual({ topics: ["AI agents"], gist: undefined })
})

test("an existing topic keeps the user's name for it; repeats and extras past three are dropped", () => {
  const reply = '{"topics": ["ai  AGENTS", "AI agents", "Rust", "Databases", "Compilers"]}'
  expect(parseTagging(reply, ["AI agents", "Databases"])?.topics).toEqual(["AI agents", "Rust", "Databases"])
})

test("a reply without usable JSON or topics is no tagging", () => {
  for (const reply of ["", "no json here", "{not json}", '{"topics": []}', '{"topics": ["  "]}', '{"gist": "x"}'])
    expect(parseTagging(reply, [])).toBeUndefined()
})

test("the model is shown the user's topics and the start of the article, and asked for the account's language", async () => {
  const { model, requests } = fakeModel('{"topics": ["AI agents"], "gist": "Hogyan terveznek az ágensek."}')
  const usage: unknown[] = []
  const tagging = await assignTopics({ model, language: "hu-HU" }, article, ["Rust", "AI agents"], call =>
    usage.push(call)
  )
  expect(tagging).toEqual({ topics: ["AI agents"], gist: "Hogyan terveznek az ágensek." })
  const [system, user] = requests[0]!.messages
  expect(system!.content).toContain("Write new topics and the gist in Hungarian.")
  expect(user!.content).toStartWith("Existing topics: Rust, AI agents\nTitle: How agents work\nSite: Example Blog\n\n")
  expect(user!.content.length).toBeLessThan(6200)
  expect(usage).toEqual([
    { model: "tagger-served", promptTokens: 11, completionTokens: 5, latencyMs: expect.any(Number) }
  ])
})

test("without a language the model writes English, and a user with no topics is told so", async () => {
  const { model, requests } = fakeModel('{"topics": ["AI agents"]}')
  await assignTopics({ model }, article, [])
  expect(requests[0]!.messages[0]!.content).toContain("in English.")
  expect(requests[0]!.messages[1]!.content).toStartWith("Existing topics: none yet\n")
})

test("no model, a failing model or an unusable reply leaves the article untagged, with a warning for the last two", async () => {
  const warnings: string[] = []
  setWarnHandler(message => warnings.push(message))
  expect(await assignTopics({}, article, [])).toBeUndefined()
  expect(await assignTopics({ model: fakeModel(new Error("503")).model }, article, [])).toBeUndefined()
  expect(await assignTopics({ model: fakeModel("I can't do that").model }, article, [])).toBeUndefined()
  expect(warnings).toEqual([
    "Reading: an article couldn't be tagged",
    "Reading: the tagging model's reply had no usable topics"
  ])
})
