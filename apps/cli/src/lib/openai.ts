import readline from "node:readline"
import OpenAI from "openai"
import { z } from "zod"

const client = new OpenAI({
  adminAPIKey: null,
  apiKey: process.env.FIREWORKS_API_KEY ?? "",
  baseURL: "https://api.fireworks.ai/inference/v1"
})

const MODEL = "accounts/fireworks/models/kimi-k2p6"
const MAX_TURNS = 10
const CHAT_OPTIONS = { temperature: 0, top_p: 0.9, max_tokens: 1024 } as const

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
    run("echo $DISPLAY").catch(() => "")
  ])

  const displayServer = waylandDisplay ? "Wayland" : xDisplay ? "X11" : "unknown"

  const wm =
    xdgDesktop || ((await which("hyprctl")) ? "Hyprland" : "") || ((await which("sway")) ? "Sway" : "") || "unknown"

  const notifTool = (await which("dunstify"))
    ? "dunstify"
    : (await which("notify-send"))
      ? "notify-send"
      : (await which("makoctl"))
        ? "makoctl"
        : "unknown"

  const pkgManager = (await which("pacman"))
    ? "pacman"
    : (await which("apt"))
      ? "apt"
      : (await which("dnf"))
        ? "dnf"
        : (await which("zypper"))
          ? "zypper"
          : "unknown"

  const audioServer =
    (await run("systemctl --user is-active pipewire 2>/dev/null").catch(() => "")).trim() === "active"
      ? "PipeWire"
      : (await run("systemctl --user is-active pulseaudio 2>/dev/null").catch(() => "")).trim() === "active"
        ? "PulseAudio"
        : (await which("jackd"))
          ? "JACK"
          : (await which("aplay"))
            ? "ALSA"
            : "unknown"

  const audioTools =
    (
      await Promise.all([
        which("pactl").then(ok => (ok ? "pactl" : "")),
        which("pw-cli").then(ok => (ok ? "pw-cli" : "")),
        which("aplay").then(ok => (ok ? "aplay" : "")),
        which("ffplay").then(ok => (ok ? "ffplay" : "")),
        which("mpv").then(ok => (ok ? "mpv" : "")),
        which("sox").then(ok => (ok ? "sox" : ""))
      ])
    )
      .filter(Boolean)
      .join(", ") || "none"

  const browserDesktop = (await run("xdg-settings get default-web-browser 2>/dev/null").catch(() => "")).trim()
  const browserExec = browserDesktop
    ? (
      await run(
        `grep -m1 "^Exec=" /usr/share/applications/${browserDesktop} /usr/local/share/applications/${browserDesktop} ~/.local/share/applications/${browserDesktop} 2>/dev/null | head -1 | sed 's/^Exec=//;s/ .*//'`
      ).catch(() => "")
    ).trim()
    : ""
  const browser = browserExec || "xdg-open"

  const clipboard = (await which("wl-copy"))
    ? "wl-copy / wl-paste"
    : (await which("xclip"))
      ? "xclip"
      : (await which("xsel"))
        ? "xsel"
        : "unknown"

  const urlEncoder = (await which("jq"))
    ? "jq -rn --arg q \"...\" '$q|@uri'"
    : "python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))'"

  const lines = [
    `- OS: ${distroName || "Linux"}`,
    `- Shell: ${shell || "bash"}`,
    `- Display server: ${displayServer}`,
    `- Desktop/WM: ${wm}`,
    `- Notification tool: ${notifTool}`,
    `- Package manager: ${pkgManager}`,
    `- Audio server: ${audioServer}`,
    `- Audio tools: ${audioTools}`,
    `- Default browser: ${browser}`,
    `- Clipboard tool: ${clipboard}`,
    `- URL encoding tool: ${urlEncoder}`
  ]

  return lines.join("\n")
}

function buildSystemPrompt(envContext: string): string {
  return `\
You are a Linux assistant. Your ONLY output is a single JSON object — nothing else.

If the request maps to a shell command:
{"type":"command","command":"<bash command>"}

If you need one piece of information to continue:
{"type":"question","question":"<one short question>"}

If the request is a question, explanation, or doesn't map to a shell command:
{"type":"answer","text":"<concise plain-text answer>"}

If the request is impossible or dangerous:
{"type":"error","message":"<short reason>"}

System environment (ground truth — use these facts, do not ask about them):
${envContext}

Rules:
- Output raw JSON only. No markdown. No code fences. No text before or after the JSON.
- Never explain, warn, greet, or repeat the user's request.
- Home directory is ~.
- Ask at most one question per turn.
- If the user answers your question, use that answer to produce a command immediately.
- If the request is clear enough to generate a command, do so — do not ask.
- Always use curl -sL -A "Mozilla/5.0" when fetching URLs.
- URL-encode query strings using the URL encoding tool from the environment.
- To open a URL in the browser, use the default browser from the environment (not xdg-open unless it's the only option).
- Quote all user-supplied values with printf '%q' or use shell arrays to prevent injection.`
}

export const LLMResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("command"), command: z.string().min(1) }),
  z.object({ type: z.literal("question"), question: z.string().min(1) }),
  z.object({ type: z.literal("answer"), text: z.string().min(1) }),
  z.object({ type: z.literal("error"), message: z.string().min(1) })
])

type LLMResponse = z.infer<typeof LLMResponseSchema>

function extractJson(raw: string): string {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
  const start = stripped.indexOf("{")
  const end = stripped.lastIndexOf("}")
  if (start !== -1 && end !== -1) return stripped.slice(start, end + 1)
  return stripped
}

function parseModelResponse(raw: string): LLMResponse {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJson(raw))
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

export async function generateCommand(userRequest: string, systemPrompt?: string): Promise<string | null> {
  const prompt = systemPrompt ?? buildSystemPrompt(await detectEnvironment())
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: prompt },
    { role: "user", content: userRequest }
  ]

  let rl: readline.Interface | null = null
  let parseRetries = 0

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages,
        ...CHAT_OPTIONS,
        stream: false
      })

      const raw = response.choices[0].message.content ?? ""
      let parsed: LLMResponse

      try {
        parsed = parseModelResponse(raw)
        parseRetries = 0
      } catch {
        if (parseRetries >= 2) throw new Error(`Model repeatedly returned non-JSON: ${raw}`)
        parseRetries++
        messages.push({ role: "assistant", content: raw })
        messages.push({
          role: "user",
          content:
            "Your last response was not valid JSON. Respond with only a JSON object matching the required format."
        })
        continue
      }

      if (parsed.type === "command") {
        process.stdout.write(`${turn + 1} turn(s)\n`)
        return parsed.command
      }

      if (parsed.type === "answer") {
        process.stdout.write(`${parsed.text}\n`)
        return null
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
    process.stderr.write("Usage: bun src/lib/openai.ts <your request>\n")
    process.exit(1)
  }
  const envContext = await detectEnvironment()
  const systemPrompt = buildSystemPrompt(envContext)
  const command = await generateCommand(userRequest, systemPrompt)
  if (command) {
    process.stdout.write(`${command}\n`)
    const result = Bun.spawnSync(["bash", "-c", command], { stdout: "inherit", stderr: "inherit" })
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(3)
    process.stdout.write(`Elapsed time: ${elapsedSeconds}s\n`)
    process.exit(result.exitCode ?? 0)
  }
  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(3)
  process.stdout.write(`Elapsed time: ${elapsedSeconds}s\n`)
}

process.exit(0)
