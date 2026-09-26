import { readdir, readFile } from "node:fs/promises"
import { cpus, freemem, loadavg, totalmem } from "node:os"
import type { SandboxStats } from "@kaja/schema/api"
import type { EgressCounts } from "./egress"
import type { ProcessPool } from "./pool"

const STARTED_AT = new Date()

/** What the sandbox is doing right now, for `GET /stats`. */
export async function collectStats(opts: { pool: ProcessPool; egress: EgressCounts }): Promise<SandboxStats> {
  const servers = opts.pool.servers()
  const rss = await treeRss(servers.flatMap(server => (server.pid ? [server.pid] : [])))
  const own = process.memoryUsage()
  return {
    startedAt: STARTED_AT,
    abilities: opts.pool.abilities,
    limits: opts.pool.limits,
    host: {
      cpus: cpus().length,
      loadAvg: loadavg(),
      totalMemory: totalmem(),
      freeMemory: freemem(),
      container: await containerMemory()
    },
    process: { rss: own.rss, heapUsed: own.heapUsed },
    servers: servers.map(server => ({ ...server, rss: server.pid ? (rss.get(server.pid) ?? null) : null })),
    pool: opts.pool.counts,
    egress: { ...opts.egress }
  }
}

/** The cgroup v2 memory use and limit of the container the sandbox runs in, if it's in one. */
async function containerMemory(): Promise<{ current: number; max: number | null } | null> {
  const [current, max] = await Promise.all(
    ["memory.current", "memory.max"].map(file => readFile(`/sys/fs/cgroup/${file}`, "utf8").catch(() => undefined))
  )
  if (current === undefined) return null
  return { current: Number(current), max: max === undefined || max.trim() === "max" ? null : Number(max) }
}

/** Resident memory in bytes of each pid with all its descendants (a browser's many processes), read from Linux's /proc; empty elsewhere. */
export async function treeRss(pids: number[]): Promise<Map<number, number>> {
  const totals = new Map<number, number>()
  if (pids.length === 0) return totals
  const names = await readdir("/proc").catch(() => [])
  const procs = new Map<number, { parent: number; rss: number }>()
  await Promise.all(
    names
      .filter(name => /^\d+$/.test(name))
      .map(async name => {
        // A process can end between the listing and the read.
        const status = await readFile(`/proc/${name}/status`, "utf8").catch(() => "")
        const parent = /^PPid:\s+(\d+)/m.exec(status)?.[1]
        if (!parent) return
        const kb = Number(/^VmRSS:\s+(\d+) kB/m.exec(status)?.[1] ?? 0)
        procs.set(Number(name), { parent: Number(parent), rss: kb * 1024 })
      })
  )
  const children = new Map<number, number[]>()
  for (const [pid, { parent }] of procs) children.set(parent, [...(children.get(parent) ?? []), pid])
  for (const root of pids) {
    if (!procs.has(root)) continue
    let total = 0
    const queue = [root]
    for (let pid = queue.pop(); pid !== undefined; pid = queue.pop()) {
      total += procs.get(pid)?.rss ?? 0
      queue.push(...(children.get(pid) ?? []))
    }
    totals.set(root, total)
  }
  return totals
}
