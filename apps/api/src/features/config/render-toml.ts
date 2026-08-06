import type { McpServer, Model, Provider } from "@kaja/schema"
import { tomlString } from "@kaja/shared"

export function renderMcpToml(servers: McpServer[]): string {
  return servers
    .map(s => {
      const lines = ["[[servers]]", `id = ${tomlString(s.serverId)}`]

      if (s.url) {
        lines.push(`url = ${tomlString(s.url)}`)
        const headerEntries = Object.entries(s.headers)
        if (headerEntries.length > 0) {
          const headerParts = headerEntries.map(([k, v]) => `${tomlString(k)} = ${tomlString(v)}`)
          lines.push(`headers = { ${headerParts.join(", ")} }`)
        }
      } else {
        lines.push(`command = ${tomlString(s.command ?? "")}`)
        lines.push(`args = [${s.args.map(tomlString).join(", ")}]`)
        const envEntries = Object.entries(s.env)
        if (envEntries.length > 0) {
          const envParts = envEntries.map(([k, v]) => `${tomlString(k)} = ${tomlString(v)}`)
          lines.push(`env = { ${envParts.join(", ")} }`)
        }
      }

      return lines.join("\n")
    })
    .join("\n\n")
}

/**
 * Renders providers+models into the `[providers.*]` / `[[models]]` shape
 * apps/cli/schemas/models.ts expects. That format has no notion of a model
 * with multiple tasks, so a model with N tasks becomes N `[[models]]`
 * blocks sharing the same id/provider — one per task.
 */
export function renderModelsToml(providers: Provider[], models: Model[]): string {
  const providerById = new Map(providers.map(p => [p.id, p]))

  const providerBlocks = providers.map(p => {
    const lines = [`[providers.${p.name}]`, `base_url = ${tomlString(p.baseUrl)}`]
    if (p.apiKey) lines.push(`api_key = ${tomlString(p.apiKey)}`)
    return lines.join("\n")
  })

  const modelBlocks = models.flatMap(m => {
    const provider = providerById.get(m.providerId)
    return m.tasks.map(task => {
      const lines = [
        "[[models]]",
        `id = ${tomlString(m.id)}`,
        `model = ${tomlString(m.model)}`,
        `task = ${tomlString(task)}`
      ]
      if (provider && provider.name !== "default") lines.push(`provider = ${tomlString(provider.name)}`)
      return lines.join("\n")
    })
  })

  return [...providerBlocks, ...modelBlocks].join("\n\n")
}
