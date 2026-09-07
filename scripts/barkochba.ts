// Plays Barkochba (twenty questions) between two standalone chat-completion
// loops: a GUESSER driven by docs/config/personas/barkochba.toml (the real
// persona, using its own ask_user tool contract) and a THINKER that holds a
// secret and answers yes/no. No workspace deps (@kaja/nasi, openai, zod) —
// reads models.toml/secrets.toml directly and calls the chat endpoint via fetch.
//
//   bun run scripts/barkochba.ts ["the secret thing"]

import { homedir } from "node:os"
import { join } from "node:path"
import { file, TOML } from "bun"

const SECRET = process.argv[2] ?? "a rubber duck"
const MAX_ROUNDS = 20

const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "kaja")

type ModelConfig = { model: string; baseUrl: string; apiKey?: string }

async function loadChatModel(): Promise<ModelConfig> {
  const modelsToml = TOML.parse(await file(join(CONFIG_DIR, "models.toml")).text()) as {
    providers: Record<string, { base_url: string }>
    models: Record<string, { model: string; task: string; provider: string }>
  }
  const secretsToml = (await file(join(CONFIG_DIR, "secrets.toml"))
    .text()
    .then(TOML.parse)
    .catch(() => ({}))) as { providers?: Record<string, { api_key?: string }> }

  const entry = modelsToml.models.chat
  if (!entry) throw new Error(`No [models.chat] entry in ${join(CONFIG_DIR, "models.toml")}`)
  const provider = modelsToml.providers[entry.provider]
  if (!provider) throw new Error(`Unknown provider "${entry.provider}" for [models.chat]`)

  return {
    model: entry.model,
    baseUrl: provider.base_url,
    apiKey: secretsToml.providers?.[entry.provider]?.api_key
  }
}

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } }
type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string }

async function chatCompletion(
  chat: ModelConfig,
  messages: ChatMessage[],
  opts: { temperature?: number; max_tokens?: number; tools?: unknown[] } = {}
): Promise<{ content: string | null; toolCalls?: ToolCall[] }> {
  const res = await fetch(`${chat.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(chat.apiKey ? { Authorization: `Bearer ${chat.apiKey}` } : {})
    },
    body: JSON.stringify({ model: chat.model, messages, ...opts })
  })
  if (!res.ok) throw new Error(`Chat completion failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { choices: [{ message: { content: string | null; tool_calls?: ToolCall[] } }] }
  const message = data.choices[0]!.message
  return { content: message.content, toolCalls: message.tool_calls }
}

const ASK_USER_TOOL = {
  type: "function",
  function: {
    name: "ask_user",
    description: "Ask the human a yes/no question and wait for their reply.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The question to ask the human." },
        note: { type: "string", description: "Optional short reaction to their previous answer." }
      },
      required: ["question"]
    }
  }
}

type GuesserPersona = { instructions: string; temperature?: number; max_tokens?: number }

async function loadGuesserPersona(): Promise<GuesserPersona> {
  const path = join(import.meta.dir, "..", "docs", "config", "personas", "barkochba.toml")
  const toml = TOML.parse(await file(path).text()) as GuesserPersona
  return toml
}

/** Drives the guesser one round: returns its question and the ask_user call id to bind the answer to. */
async function askGuesserQuestion(
  chat: ModelConfig,
  persona: GuesserPersona,
  messages: ChatMessage[]
): Promise<{ question: string; callId: string }> {
  for (;;) {
    const { content, toolCalls } = await chatCompletion(chat, messages, {
      temperature: persona.temperature,
      max_tokens: persona.max_tokens,
      tools: [ASK_USER_TOOL]
    })
    const askCall = toolCalls?.find(c => c.function.name === "ask_user")
    if (askCall) {
      const args = JSON.parse(askCall.function.arguments) as { question: string; note?: string }
      messages.push({ role: "assistant", content, tool_calls: [askCall] })
      return { question: args.question, callId: askCall.id }
    }
    // Model replied without calling ask_user (e.g. leaked plain text) — nudge it once more.
    messages.push({ role: "assistant", content })
    messages.push({ role: "user", content: "Ask your next question using the ask_user tool, not plain text." })
  }
}

function makeThinkerMessages(): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        `You are the THINKER in Barkochba (twenty questions). You are secretly thinking of: "${SECRET}". ` +
        "Never reveal it directly. You will only ever receive a yes/no question as input. Respond with " +
        'EXACTLY one of: "Yes.", "No.", "Not exactly."\n\n' +
        "Before answering, silently check your answer against every fact you've already confirmed " +
        `about "${SECRET}" earlier in this conversation — never contradict a previous answer. If a ` +
        'question is genuinely ambiguous for this thing, prefer "Not exactly" over guessing which ' +
        "way to answer.\n\n" +
        `If the question names ${SECRET} — whether by that exact phrase, a synonym, or a more generic ` +
        `term that still uniquely nails it (e.g. "cat" or "domestic cat" for "pussycat"), reply ` +
        `"Yes, correct! It was ${SECRET}." Do not say "correct" for a near-miss or a related-but-wrong ` +
        "guess — answer those Yes/No/Not exactly like any other question instead. Never ask a question " +
        "yourself, never add commentary."
    }
  ]
}

/** Only trust a "correct" claim when the thinker's own answer names the secret — a stray "correct" (e.g. confirming an unrelated guess) must not end the game. */
function isConfirmedWin(answer: string): boolean {
  if (!/correct/i.test(answer)) return false
  return answer.toLowerCase().includes(SECRET.toLowerCase())
}

/** Strips newlines/control chars from model-generated text before it's logged. */
function forLog(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars, not matching content
  return text.replace(/[\r\n\t\x00-\x1f]+/g, " ").trim()
}

async function playRound() {
  const chat = await loadChatModel()
  const persona = await loadGuesserPersona()

  const guesserMessages: ChatMessage[] = [
    { role: "system", content: persona.instructions },
    { role: "user", content: "Let's play." }
  ]
  const thinkerMessages = makeThinkerMessages()

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const { question, callId } = await askGuesserQuestion(chat, persona, guesserMessages)
    console.log(`\n[${round}] Guesser: ${forLog(question)}`)

    thinkerMessages.push({ role: "user", content: question })
    const { content } = await chatCompletion(chat, thinkerMessages)
    const answer = content ?? ""
    thinkerMessages.push({ role: "assistant", content: answer })
    console.log(`[${round}] Thinker: ${forLog(answer)}`)

    guesserMessages.push({ role: "tool", tool_call_id: callId, content: answer })

    if (isConfirmedWin(answer)) {
      console.log(`\nSolved in ${round} round(s).`)
      return
    }
  }

  console.log(`\nGave up after ${MAX_ROUNDS} rounds without a confirmed correct guess.`)
}

await playRound()
