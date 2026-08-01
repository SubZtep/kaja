import type { Model, Provider } from "@kaja/schema"

function tomlString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
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
