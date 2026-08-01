import type { McpServer } from "@kaja/schema"

function tomlString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

export function renderMcpToml(servers: McpServer[]): string {
  return servers
    .map(s => {
      const lines = [
        "[[servers]]",
        `id = ${tomlString(s.serverId)}`,
        `command = ${tomlString(s.command)}`,
        `args = [${s.args.map(tomlString).join(", ")}]`
      ]
      const envEntries = Object.entries(s.env)
      if (envEntries.length > 0) {
        lines.push(`env = { ${envEntries.map(([k, v]) => `${tomlString(k)} = ${tomlString(v)}`).join(", ")} }`)
      }
      return lines.join("\n")
    })
    .join("\n\n")
}
