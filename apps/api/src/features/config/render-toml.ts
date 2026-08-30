import type { McpServer, Model, Provider } from "@kaja/schema/api"
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
        lines.push(`command = ${tomlString(s.command ?? "")}`, `args = [${s.args.map(tomlString).join(", ")}]`)
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
 * Renders providers+models into the `[providers.*]` / `[models.<id>]` shape
 * @kaja/schema/config's models.ts expects. That format has no notion of a model
 * with multiple tasks and keys entries by id, so a model with N tasks becomes
 * N `[models.<id>]` blocks — one per task, id suffixed with the task when
 * there's more than one (otherwise the bare model id, since that's the
 * common case and keeping it unsuffixed avoids churning every existing
 * single-task model's id).
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
      const id = m.tasks.length > 1 ? `${m.id}-${task}` : m.id
      // Quoted key: model ids (UUIDv7) start with a digit, which a bare TOML key rejects.
      const lines = [`[models.${tomlString(id)}]`, `model = ${tomlString(m.model)}`, `task = ${tomlString(task)}`]
      if (provider) lines.push(`provider = ${tomlString(provider.name)}`)
      return lines.join("\n")
    })
  })

  return [...providerBlocks, ...modelBlocks].join("\n\n")
}
