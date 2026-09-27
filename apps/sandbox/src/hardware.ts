import { arch, cpus, freemem, loadavg, platform, release, totalmem } from "node:os"
import type { SandboxInfo, SandboxLoad } from "@kaja/schema/api"
import pkg from "../package.json" with { type: "json" }
import type { ProcessPool } from "./pool"
import { containerMemory } from "./stats"

/** What the sandbox tells the API about itself when it connects. */
export async function sandboxInfo(opts: { name?: string; pool: ProcessPool }): Promise<SandboxInfo> {
  const cores = cpus()
  const container = await containerMemory()
  return {
    version: pkg.version,
    name: opts.name ?? null,
    arch: arch(),
    os: `${platform()} ${release()}`.slice(0, 120),
    cpu: { model: (cores[0]?.model ?? "unknown").trim().slice(0, 200), cores: cores.length },
    memory: { total: totalmem(), limit: container?.max ?? null },
    maxProcesses: opts.pool.limits.maxProcesses,
    abilities: opts.pool.abilities
  }
}

/** How busy it is, for the heartbeat. */
export async function sandboxLoad(pool: ProcessPool): Promise<SandboxLoad> {
  const container = await containerMemory()
  return {
    running: pool.size,
    load: loadavg()[0] ?? 0,
    memoryUsed: container?.current ?? totalmem() - freemem()
  }
}
