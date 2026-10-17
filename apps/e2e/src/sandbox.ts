import { mkdirSync, openSync, rmSync } from "node:fs"
import { join } from "node:path"
import { queryDb } from "./db"
import { e2eDir, e2eEnv } from "./env"
import type { Stack } from "./stack"

const SANDBOX_DIR = join(e2eDir, "..", "sandbox")

/** The key the API treats as its official sandbox's (SANDBOX_SYSTEM_KEY), which every user may use. */
export const SANDBOX_KEY = "e2e-official-sandbox-key"

/** Runs the real sandbox app (`apps/sandbox`) against the stack as its official sandbox, and waits until it shows online. */
export async function startSandbox(stack: Stack): Promise<{ stop(): Promise<void> }> {
  const out = join(e2eDir, e2eEnv.E2E_OUT_DIR)
  const state = join(out, "sandbox-state")
  rmSync(state, { recursive: true, force: true })
  mkdirSync(join(out, "logs"), { recursive: true })
  const log = openSync(join(out, "logs", "sandbox.log"), "w")

  const child = Bun.spawn(["bun", "run", "src/cli.ts"], {
    cwd: SANDBOX_DIR,
    env: {
      ...process.env,
      KAJA_API_URL: stack.apiUrl,
      KAJA_SANDBOX_KEY: SANDBOX_KEY,
      SANDBOX_NAME: "e2e sandbox",
      SANDBOX_STATE_DIR: state,
      SANDBOX_ISOLATE_USERS: "false",
      // Not the 3128 a `bun dev:sandbox` may be using
      SANDBOX_EGRESS_PORT: "3129",
      // Blank, so a dev sandbox's own .env (its overrides file, its web proxy) stays out of this one
      SANDBOX_OVERRIDES: "",
      WEB_PROXY: ""
    },
    stdout: log,
    stderr: log
  })
  const stop = async () => {
    child.kill()
    await child.exited
  }

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`The sandbox exited with ${child.exitCode} (see e2e-out/logs/sandbox.log)`)
    const online = await queryDb(stack, `SELECT 1 FROM sandbox WHERE online`)
    if (online.length > 0) return { stop }
    await Bun.sleep(500)
  }
  await stop()
  throw new Error("The sandbox didn't register within 60 s (see e2e-out/logs/sandbox.log)")
}
