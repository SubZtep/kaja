import { describe, expect, test } from "bun:test"
import type { WidgetMe } from "@kaja/schema/api"
import { handleBarkochba } from "./game"
import { type PlayerChat, runPlayer } from "./player"
import {
  BARKOCHBA_MAX_QUESTIONS,
  GameRuleError,
  type GameState,
  homepagePairProblem,
  IDLE_GAME,
  stepGame
} from "./rules"

const board = (links: string[]): WidgetMe => ({
  id: "01900000-0000-7000-8000-000000000001",
  label: "Board",
  intent: "Show it",
  model: "m",
  target: { kind: "browser", page: "home", selector: "#kaja-barkochba" },
  links,
  publishedGenerationId: null
})

const player = (id: string): WidgetMe => ({
  id,
  label: "Player",
  intent: "Ask",
  model: "m",
  target: { kind: "server" },
  links: [],
  publishedGenerationId: null
})

test("the homepage pair must be a linked browser board and server player", () => {
  const playerId = "01900000-0000-7000-8000-000000000002"
  expect(homepagePairProblem(board([playerId]), player(playerId))).toBeUndefined()
  expect(homepagePairProblem(board([]), player(playerId))).toBeDefined()
  expect(
    homepagePairProblem(board([playerId]), {
      ...player(playerId),
      target: { kind: "browser", page: "home", selector: "#x" }
    })
  ).toBeDefined()
})

describe("barkochba rules", () => {
  const play = async () => ({ type: "question" as const, text: "Is it red?" })

  test("a start asks once and an answer after twenty ends without another question", async () => {
    let calls = 0
    const counting: typeof play = async () => {
      calls += 1
      return { type: "question", text: `q${calls}` }
    }
    let state = await stepGame(IDLE_GAME, { type: "start", locale: "en-GB" }, counting)
    expect(state.questionCount).toBe(1)
    while (state.phase === "playing" && state.questionCount < BARKOCHBA_MAX_QUESTIONS) {
      state = await stepGame(state, { type: "answer", value: "No", locale: "en-GB" }, counting)
    }
    expect(state.questionCount).toBe(BARKOCHBA_MAX_QUESTIONS)
    const ended = await stepGame(state, { type: "answer", value: "No", locale: "en-GB" }, counting)
    expect(ended.phase).toBe("lost")
    expect(calls).toBe(BARKOCHBA_MAX_QUESTIONS)
  })

  test("yes to a guess wins without another question", async () => {
    const guessing = async () => ({ type: "guess" as const, text: "Is it a pizza?" })
    const playing = await stepGame(IDLE_GAME, { type: "start", locale: "en-GB" }, guessing)
    let calls = 0
    const won = await stepGame(playing, { type: "answer", value: "Yes", locale: "en-GB" }, async () => {
      calls += 1
      return { type: "question", text: "again" }
    })
    expect(won.phase).toBe("won")
    expect(calls).toBe(0)
  })

  test("an answer while idle is refused", async () => {
    await expect(stepGame(IDLE_GAME, { type: "answer", value: "Yes", locale: "en-GB" }, play)).rejects.toBeInstanceOf(
      GameRuleError
    )
  })

  test("give up stops a game", async () => {
    const playing: GameState = { ...IDLE_GAME, phase: "playing", question: "Is it red?", questionCount: 1 }
    const lost = await stepGame(playing, { type: "giveup" }, play)
    expect(lost.phase).toBe("lost")
  })
})

describe("player runner", () => {
  const request = { history: [{ role: "user" as const, content: "Let's play." }], locale: "en-GB", maxQuestions: 20 }

  test("the host performs the completion and a third chat is refused", async () => {
    const calls: string[] = []
    const source = `export async function play({ ai }) {
      await ai.chat([{ role: "user", content: "one" }])
      await ai.chat([{ role: "user", content: "two" }])
      await ai.chat([{ role: "user", content: "three" }])
      return { type: "question", text: "nope" }
    }`
    await expect(
      runPlayer(source, request, async messages => {
        calls.push(messages[0]!.content)
        return "ok"
      })
    ).rejects.toThrow("too many completions")
    expect(calls).toEqual(["one", "two"])
  })

  test("a malformed result is rejected", async () => {
    const source = `export async function play() { return { type: "nope", text: "x" } }`
    await expect(runPlayer(source, request, async () => "ok")).rejects.toThrow("bad result")
  })

  test("a question comes back from the host's reply", async () => {
    const source = `export async function play({ ai, history }) {
      const text = await ai.chat([{ role: "user", content: history[0].content }])
      return { type: "question", text }
    }`
    const result = await runPlayer(source, request, async () => "Is it a pizza?")
    expect(result).toEqual({ type: "question", text: "Is it a pizza?" })
  })

  test("a plain exported play works too", async () => {
    const source = `export function play() { return { type: "giveup", text: "You win." } }`
    expect(await runPlayer(source, request, async () => "")).toEqual({ type: "giveup", text: "You win." })
  })
})

describe("homepage game action", () => {
  const BOARD = "kwt_board-secret"
  const PLAYER = "kwt_player-secret"
  const boardId = "01900000-0000-7000-8000-000000000011"
  const playerId = "01900000-0000-7000-8000-000000000012"

  function fakeApi(boardLinks: string[]) {
    const calls: { token: string; path: string }[] = []
    const states = new Map<string, unknown>()
    const me: Record<string, WidgetMe> = {
      [BOARD]: { ...board(boardLinks), id: boardId, publishedGenerationId: "01900000-0000-7000-8000-000000000021" },
      [PLAYER]: { ...player(playerId), publishedGenerationId: "01900000-0000-7000-8000-000000000022" }
    }
    const api = async (token: string, path: string, init?: RequestInit) => {
      calls.push({ token, path })
      const json = (body: unknown) => Response.json(body)
      if (path === "/widget/me") return json(me[token])
      if (path === "/widget/source")
        return json({
          generationId: me[token]!.publishedGenerationId,
          source: token === BOARD ? "<p>board</p>" : "player"
        })
      if (path.startsWith("/widget/state/")) {
        if (init?.method === "PUT") states.set(path, JSON.parse(init.body as string).state)
        return json({ state: states.get(path) ?? null })
      }
      if (path === "/ai/chat") return json({ message: "Is it alive?", usage: { promptTokens: 1, completionTokens: 1 } })
      return new Response(null, { status: 404 })
    }
    return { api, calls }
  }

  // Each test its own visitor, so the per-visitor rate limit never carries over
  const host = (api: ReturnType<typeof fakeApi>["api"], tokens = { boardToken: BOARD, playerToken: PLAYER }) => {
    const visitor = crypto.randomUUID()
    return {
      ...tokens,
      visitorId: () => visitor as string | undefined,
      api,
      runPlayer: async (_source: string, _request: unknown, chat: PlayerChat) => ({
        type: "question" as const,
        text: await chat([{ role: "user", content: "go" }])
      })
    }
  }

  test("a start asks through the player and the payload carries no token", async () => {
    const { api, calls } = fakeApi([playerId])
    const view = await handleBarkochba({ type: "start", locale: "en-GB" }, host(api))
    expect(view).toMatchObject({ ready: true, phase: "playing", question: "Is it alive?", source: "<p>board</p>" })
    expect(JSON.stringify(view)).not.toContain("kwt_")
    expect(calls.find(call => call.path === "/ai/chat")?.token).toBe(PLAYER)
    expect(calls.filter(call => call.path.startsWith("/widget/state/")).every(call => call.token === BOARD)).toBe(true)
  })

  test("a sync before any play sets no visitor and calls nothing", async () => {
    const { api, calls } = fakeApi([playerId])
    const created: boolean[] = []
    const view = await handleBarkochba(
      { type: "sync" },
      {
        ...host(api),
        visitorId: create => {
          created.push(create)
          return undefined
        }
      }
    )
    expect(view).toMatchObject({ ready: true, phase: "idle" })
    expect(created).toEqual([false])
    expect(calls).toEqual([])
  })

  test("missing server tokens leave the tile unavailable without calling the API", async () => {
    const { api, calls } = fakeApi([playerId])
    const view = await handleBarkochba({ type: "sync" }, host(api, { boardToken: BOARD, playerToken: "" }))
    expect(view.ready).toBe(false)
    expect(calls).toEqual([])
  })

  test("a board not linked to the player is refused before any model call", async () => {
    const { api, calls } = fakeApi([])
    const view = await handleBarkochba({ type: "start", locale: "en-GB" }, host(api))
    expect(view.error).toBe("unavailable")
    expect(calls.map(call => call.path)).toEqual(["/widget/me", "/widget/me"])
  })

  test("fresh visitors share a global ceiling", async () => {
    const { api } = fakeApi([playerId])
    let limited = 0
    for (let i = 0; i < 320; i++) {
      const view = await handleBarkochba({ type: "giveup" }, host(api))
      if (view.error === "rate") limited++
    }
    expect(limited).toBeGreaterThan(0)
  })
})
