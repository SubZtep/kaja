import { mkdirSync, openSync } from "node:fs"
import { join } from "node:path"
import { e2eDir, e2eEnv } from "./env"

/** The model the cloud turns use: a hosted provider or a local llama.cpp. */
export type Llama = { baseUrl: string; model: string; apiKey?: string; stop(): Promise<void> }

async function modelName(baseUrl: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${baseUrl}/models`)
    if (!response.ok) return undefined
    return ((await response.json()) as { data?: { id: string }[] }).data?.[0]?.id
  } catch {
    return undefined
  }
}

/** The model for scenarios that need one: the hosted provider when E2E_LLM_API_KEY is set, else {@link startLlama}. */
export async function startModel(): Promise<Llama> {
  if (!e2eEnv.E2E_LLM_API_KEY) return startLlama()
  return {
    baseUrl: e2eEnv.E2E_LLM_BASE_URL,
    model: e2eEnv.E2E_LLM_MODEL,
    apiKey: e2eEnv.E2E_LLM_API_KEY,
    stop: async () => {}
  }
}

/** The llama.cpp server the cloud turns talk to: the one already answering at E2E_LLAMA_URL, else one started here (`--jinja`, for tool calls). */
export async function startLlama(): Promise<Llama> {
  const url = new URL(e2eEnv.E2E_LLAMA_URL)
  const baseUrl = `${url.origin}/v1`
  const running = await modelName(baseUrl)
  if (running) return { baseUrl, model: running, stop: async () => {} }

  const model = e2eEnv.E2E_LLAMA_MODEL
  if (!model) throw new Error(`Nothing answers at ${baseUrl}; start llama-server or set E2E_LLAMA_MODEL`)
  const bin = e2eEnv.E2E_LLAMA_BIN ?? Bun.which("llama-server")
  if (!bin) throw new Error("llama-server isn't on PATH; set E2E_LLAMA_BIN")

  const logDir = join(e2eDir, e2eEnv.E2E_OUT_DIR, "logs")
  mkdirSync(logDir, { recursive: true })
  const log = openSync(join(logDir, "llama.log"), "w")
  const child = Bun.spawn(
    [
      bin,
      "-m",
      model,
      "--port",
      url.port || "8080",
      "--jinja",
      "-c",
      String(e2eEnv.E2E_LLAMA_CONTEXT),
      ...(e2eEnv.E2E_LLAMA_ARGS?.split(/\s+/) ?? [])
    ],
    { stdout: log, stderr: log }
  )
  const stop = async () => {
    child.kill()
    await child.exited
  }
  // Loading a model takes a while, and a cold disk cache longer
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`llama-server exited with ${child.exitCode} (see ${logDir}/llama.log)`)
    const name = await modelName(baseUrl)
    if (name) return { baseUrl, model: name, stop }
    await Bun.sleep(1000)
  }
  await stop()
  throw new Error(`llama-server wasn't ready within 180 s (see ${logDir}/llama.log)`)
}
