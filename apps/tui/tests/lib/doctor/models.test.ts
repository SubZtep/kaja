import { expect, test } from "bun:test"
import { stripVTControlCharacters } from "node:util"
import type { CliResolvedModel } from "@kaja/schema/config"
import { groupModelsByTask, type ModelIo, runModelPass } from "../../../lib/doctor/models"

const model = (id: string, task: CliResolvedModel["task"], provider: string, name: string): CliResolvedModel => ({
  id,
  task,
  provider,
  model: name,
  baseUrl: `https://${provider}.test/v1`
})

const FIREWORKS_CHAT = model("chat", "chat", "fireworks", "minimax-m3")
const OLLAMA_CHAT = model("ollama-chat", "chat", "ollama", "llama3.2:1b")
const LLAMA_CHAT = model("llama-chat", "chat", "llama", "ministral")
const EMBEDDING = model("embedding", "embedding", "fireworks", "qwen3-embedding")

type Probe = NonNullable<Parameters<typeof runModelPass>[3]>["probe"]

/** A probe that answers per model name: everything up unless it is listed as down, with the reason given. */
function probeWith(down: Record<string, string> = {}) {
  const calls: string[] = []
  const probe: Probe = async m => {
    calls.push(m.model)
    return m.model in down ? { ok: false, error: down[m.model]!, status: 401 } : { ok: true }
  }
  return { probe, calls }
}

/** An io that answers each question with the next canned pick, recording what it was asked. */
function io(picks: (number | undefined)[] = [], interactive = true) {
  const asked: { title: string; items: string[] }[] = []
  const fake: ModelIo = {
    interactive,
    askPick: async (title, items) => {
      asked.push({ title, items })
      return picks.shift()
    }
  }
  return { fake, asked }
}

function saver() {
  const saved: [string, string, string][] = []
  return {
    saved,
    save: async (task: string, provider: string, name: string) => void saved.push([task, provider, name])
  }
}

async function run(
  models: CliResolvedModel[],
  down: Record<string, string>,
  picks: (number | undefined)[] = [],
  interactive = true
) {
  const lines: string[] = []
  const { probe, calls } = probeWith(down)
  const { fake, asked } = io(picks, interactive)
  const { saved, save } = saver()
  const outcomes = await runModelPass(models, line => lines.push(stripVTControlCharacters(line)), fake, { probe, save })
  return { lines, calls, asked, saved, outcomes }
}

test("groups models by task in the order the report lists them", () => {
  const grouped = groupModelsByTask([EMBEDDING, OLLAMA_CHAT, FIREWORKS_CHAT])
  expect(grouped.map(([task]) => task)).toEqual(["chat", "embedding"])
  expect(grouped[0]![1]).toEqual([OLLAMA_CHAT, FIREWORKS_CHAT])
})

test("a working model is listed and nothing is asked", async () => {
  const r = await run([FIREWORKS_CHAT, EMBEDDING], {})
  expect(r.lines).toContain("  ✔ minimax-m3 (up)")
  expect(r.lines).toContain("  ✔ qwen3-embedding (up)")
  expect(r.asked).toEqual([])
  expect(r.outcomes.map(o => o.ok)).toEqual([true, true])
})

test("a failing model says why", async () => {
  const r = await run([FIREWORKS_CHAT], { "minimax-m3": "401 The API key you provided is invalid." })
  expect(r.lines).toContain("  ✘ minimax-m3 (down): 401 The API key you provided is invalid.")
  expect(r.outcomes).toMatchObject([{ task: "chat", ok: false }])
})

test("a broken default with a working alternative offers the switch, and choosing it rewrites the default", async () => {
  const r = await run([FIREWORKS_CHAT, OLLAMA_CHAT], { "minimax-m3": "401 bad key" }, [1])

  expect(r.asked).toHaveLength(1)
  expect(r.asked[0]!.title).toContain("minimax-m3 didn't work: 401 bad key")
  // The safe answer is first, then only the models that actually answered.
  expect(r.asked[0]!.items).toEqual(["Keep minimax-m3", "ollama — llama3.2:1b"])
  expect(r.saved).toEqual([["chat", "ollama", "llama3.2:1b"]])
  expect(r.lines.at(-1)).toContain("chat now uses ollama — llama3.2:1b")
  expect(r.outcomes[0]).toMatchObject({ ok: true, switchedTo: OLLAMA_CHAT })
})

test("a reason that already ends in a full stop does not double it in the question", async () => {
  const r = await run([FIREWORKS_CHAT, OLLAMA_CHAT], { "minimax-m3": "401 The API key is invalid." }, [0])
  expect(r.asked[0]!.title).toContain("didn't work: 401 The API key is invalid. Use another chat model instead?")
  expect(r.asked[0]!.title).not.toContain("..")
})

test("keeping the broken model, or dismissing the question, changes nothing", async () => {
  const keep = await run([FIREWORKS_CHAT, OLLAMA_CHAT], { "minimax-m3": "down" }, [0])
  expect(keep.saved).toEqual([])
  expect(keep.outcomes[0]).toMatchObject({ ok: false })

  const dismissed = await run([FIREWORKS_CHAT, OLLAMA_CHAT], { "minimax-m3": "down" }, [undefined])
  expect(dismissed.saved).toEqual([])
  expect(dismissed.outcomes[0]).toMatchObject({ ok: false })
})

test("only alternatives that answered are offered, and the pick picks among them", async () => {
  const r = await run([FIREWORKS_CHAT, OLLAMA_CHAT, LLAMA_CHAT], { "minimax-m3": "down", "llama3.2:1b": "down" }, [1])
  expect(r.asked[0]!.items).toEqual(["Keep minimax-m3", "llama — ministral"])
  expect(r.saved).toEqual([["chat", "llama", "ministral"]])
})

test("when nothing else answers either, it says so and asks nothing", async () => {
  const r = await run([FIREWORKS_CHAT, OLLAMA_CHAT], { "minimax-m3": "down", "llama3.2:1b": "down" })
  expect(r.asked).toEqual([])
  expect(r.lines.some(line => line.includes("No other chat model answered either."))).toBe(true)
})

test("a broken default with no alternative is only reported", async () => {
  const r = await run([FIREWORKS_CHAT], { "minimax-m3": "down" })
  expect(r.asked).toEqual([])
  expect(r.lines.some(line => line.includes("No other"))).toBe(false)
})

test("a working default is never offered a switch, even with alternatives", async () => {
  const r = await run([FIREWORKS_CHAT, OLLAMA_CHAT], { "llama3.2:1b": "down" })
  expect(r.asked).toEqual([])
  expect(r.outcomes[0]).toMatchObject({ ok: true })
})

test("a broken alternative alone does not fail the task", async () => {
  const r = await run([FIREWORKS_CHAT, OLLAMA_CHAT], { "llama3.2:1b": "down" })
  expect(r.lines).toContain("  ✘ llama3.2:1b (down): down")
  expect(r.outcomes).toHaveLength(1)
  expect(r.outcomes[0]).toMatchObject({ task: "chat", ok: true })
})

test("without a terminal the failures are only reported", async () => {
  const r = await run([FIREWORKS_CHAT, OLLAMA_CHAT], { "minimax-m3": "down" }, [1], false)
  expect(r.asked).toEqual([])
  expect(r.saved).toEqual([])
  expect(r.outcomes[0]).toMatchObject({ ok: false })
})

test("each task decides for itself, and every model is probed exactly once", async () => {
  const r = await run([FIREWORKS_CHAT, OLLAMA_CHAT, EMBEDDING], { "qwen3-embedding": "down" })
  expect(r.calls.sort()).toEqual(["llama3.2:1b", "minimax-m3", "qwen3-embedding"])
})

test("a task with only alternatives and no default is listed but has no outcome", async () => {
  const r = await run([OLLAMA_CHAT], { "llama3.2:1b": "down" })
  expect(r.lines).toContain("  ✘ llama3.2:1b (down): down")
  expect(r.outcomes).toEqual([])
})
