import { readFile } from "node:fs/promises"
import { freemem, totalmem } from "node:os"
import { containerMemory } from "./stats"

/** Memory set aside per server (a headless Chrome takes about 300-500 MB), and for the sandbox itself. */
export const SERVER_MEMORY = 512 * 1024 * 1024

export type Memory = { container: { current: number; max: number | null } | null; total: number; free: number }

// The container's use less the file cache the kernel drops under pressure (memory.stat's inactive_file), which memory.current counts too.
async function readMemory(): Promise<Memory> {
  const [container, stat] = await Promise.all([
    containerMemory(),
    readFile("/sys/fs/cgroup/memory.stat", "utf8").catch(() => "")
  ])
  const cache = Number(/^inactive_file (\d+)$/m.exec(stat)?.[1] ?? 0)
  return {
    container: container && { ...container, current: Math.max(0, container.current - cache) },
    total: totalmem(),
    free: freemem()
  }
}

/** How many servers fit: the container's memory limit, else the machine's RAM, less the sandbox's own share, one per {@link SERVER_MEMORY}. */
export async function defaultMaxProcesses(memory?: Memory): Promise<number> {
  const { container, total } = memory ?? (await readMemory())
  const budget = (container?.max ?? total) - SERVER_MEMORY
  return Math.max(1, Math.floor(budget / SERVER_MEMORY))
}

/** Whether another server fits right now: at least {@link SERVER_MEMORY} left under the container's limit, else free on the machine. */
export async function hasRoom(memory?: Memory): Promise<boolean> {
  const { container, free } = memory ?? (await readMemory())
  const left = container?.max != null ? container.max - container.current : free
  return left >= SERVER_MEMORY
}
