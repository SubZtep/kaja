import type { Sandbox } from "@kaja/schema/api"
import { m } from "../paraglide/messages.js"

const UNITS = ["B", "KB", "MB", "GB", "TB"]

/** 512 MB, 1.4 GB: binary units, one decimal from a gigabyte up. */
export function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(unit >= 3 ? 1 : 0)} ${UNITS[unit]}`
}

/** The `docker run` that starts a sandbox: linked to the account whose `key` it carries, else anonymous. */
export function runCommand(key?: string): string {
  const env = key ? ` -e KAJA_SANDBOX_KEY=${key}` : ""
  return `docker run -d --restart unless-stopped --shm-size 1g -v kaja-sandbox:/data${env} subztep/kaja-sandbox`
}

/** Where it is, as the geolocation service placed its IP. */
export function place(sandbox: Sandbox): string {
  return [sandbox.city, sandbox.country].filter(Boolean).join(", ") || m.sandbox_location_unknown()
}

/** Cores, memory, arch and version from its hello. */
export function hardware(sandbox: Sandbox): string | undefined {
  const info = sandbox.info
  if (!info) return undefined
  return m.sandbox_hardware({
    cores: info.cpu.cores,
    memory: formatBytes(info.memory.limit ?? info.memory.total),
    arch: info.arch,
    version: info.version
  })
}
