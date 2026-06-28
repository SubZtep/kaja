import { Ollama } from "ollama"
import readline from "node:readline"
import { z } from "zod"

const ollama = new Ollama({ host: "http://localhost:11434/" })

const MODEL = "qwen3.5:9b"
const MAX_TURNS = 10
const CHAT_OPTIONS = { temperature: 0, top_p: 0.9, repeat_penalty: 1.1, num_predict: 200 } as const

async function run(cmd: string): Promise<string> {
  const proc = Bun.spawn(["bash", "-c", cmd], { stdout: "pipe", stderr: "pipe" })
  const out = await new Response(proc.stdout).text()
  return out.trim()
}

async function which(bin: string): Promise<boolean> {
  const proc = Bun.spawn(["which", bin], { stdout: "pipe", stderr: "pipe" })
  await proc.exited
  return proc.exitCode === 0
}

async function detectEnvironment(): Promise<string> {
  const [distroName, shell, xdgDesktop, waylandDisplay, xDisplay] = await Promise.all([
    run("grep ^NAME= /etc/os-release | cut -d= -f2 | tr -d '\"'").catch(() => ""),
    run("basename $SHELL").catch(() => ""),
    run("echo $XDG_CURRENT_DESKTOP").catch(() => ""),
    run("echo $WAYLAND_DISPLAY").catch(() => ""),
    run("echo $DISPLAY").catch(() => ""),
  ])

  const displayServer = waylandDisplay ? "Wayland" : xDisplay ? "X11" : "unknown"

  // Detect window manager / desktop
  const wm =
    xdgDesktop ||
    ((await which("hyprctl")) ? "Hyprland" : "") ||
    ((await which("sway")) ? "Sway" : "") ||
    "unknown"

  // Detect notification daemon
  const notifTool =
    (await which("dunstify")) ? "dunstify" :
      (await which("notify-send")) ? "notify-send" :
        (await which("makoctl")) ? "makoctl" :
          "unknown"

  // Detect package manager
  const pkgManager =
    (await which("pacman")) ? "pacman" :
      (await which("apt")) ? "apt" :
        (await which("dnf")) ? "dnf" :
          (await which("zypper")) ? "zypper" :
            "unknown"

  const lines = [
    `- OS: ${distroName || "Linux"}`,
    `- Shell: ${shell || "bash"}`,
    `- Display server: ${displayServer}`,
    `- Desktop/WM: ${wm}`,
    `- Notification tool: ${notifTool}`,
    `- Package manager: ${pkgManager}`,
  ]

  return lines.join("\n")
}

function buildSystemPrompt(envContext: string): string {
  return `\
You are a Bash command generator. Your ONLY output is a single JSON object — nothing else.

If you have enough information:
{"type":"command","command":"<bash command>"}

If you need one piece of information:
{"type":"question","question":"<one short question>"}

If the request is impossible or dangerous to fulfill as a Bash command:
{"type":"error","message":"<short reason>"}

System environment (ground truth — use these facts, do not ask about them):
${envContext}

Rules:
- Output raw JSON only. No markdown. No code fences. No text before or after the JSON.
- Never explain, warn, greet, or repeat the user's request.
- Home directory is ~.
- Ask at most one question per turn.
- If the user answers your question, use that answer to produce a command immediately.
- If the request is clear enough to generate a reasonable command, do so — do not ask.
- To fetch a webpage and read its content, use curl -sL (silent, follow redirects).
- To open a URL in the default browser, use xdg-open.`
}

export const LLMResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("command"), command: z.string().min(1) }),
  z.object({ type: z.literal("question"), question: z.string().min(1) }),
  z.object({ type: z.literal("error"), message: z.string().min(1) }),
])

type LLMResponse = z.infer<typeof LLMResponseSchema>

function parseModelResponse(raw: string): LLMResponse {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.trim())
  } catch {
    throw new Error(`Model returned non-JSON: ${raw}`)
  }
  const result = LLMResponseSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Schema mismatch: ${JSON.stringify(result.error.issues)}`)
  }
  return result.data
}

function askUser(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve))
}

export async function generateCommand(userRequest: string, systemPrompt?: string): Promise<string> {
  const prompt = systemPrompt ?? buildSystemPrompt(await detectEnvironment())
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: prompt },
    { role: "user", content: userRequest },
  ]

  let rl: readline.Interface | null = null

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {

      // process.stdout.write(`\n\nTurn ${turn + 1}.\n\n`)
      // process.stdout.write(JSON.stringify(messages, null, 2))

      const response = await ollama.chat({
        model: MODEL,
        think: false,
        options: CHAT_OPTIONS,
        messages,
        stream: false,
      })

      const raw = response.message.content
      let parsed: LLMResponse

      try {
        parsed = parseModelResponse(raw)
      } catch {
        // Single retry on bad JSON
        messages.push({ role: "assistant", content: raw })
        messages.push({
          role: "user",
          content: "Your last response was not valid JSON. Respond with only a JSON object matching the required format.",
        })
        continue
      }

      if (parsed.type === "command") {
        return parsed.command
      }

      if (parsed.type === "error") {
        throw new Error(parsed.message)
      }

      // type === "question"
      if (!rl) {
        rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      }

      const answer = await askUser(rl, `${parsed.question} `)
      messages.push({ role: "assistant", content: raw })
      messages.push({ role: "user", content: answer })
    }

    throw new Error(`Model did not produce a command after ${MAX_TURNS} turns`)
  } finally {
    rl?.close()
  }
}

if (import.meta.main) {
  const startTime = Date.now()
  const userRequest = process.argv.slice(2).join(" ").trim()
  if (!userRequest) {
    process.stderr.write("Usage: bun src/lib/ollama.ts <your request>\n")
    process.exit(1)
  }
  const envContext = await detectEnvironment()
  const systemPrompt = buildSystemPrompt(envContext)
  const command = await generateCommand(userRequest, systemPrompt)
  process.stdout.write(command + "\n")
  const result = Bun.spawnSync(["bash", "-c", command], { stdout: "inherit", stderr: "inherit" })
  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(3)
  process.stdout.write(`Elapsed time: ${elapsedSeconds}s\n`)
  process.exit(result.exitCode ?? 0)
}

process.exit(1)
