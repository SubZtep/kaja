import type { Model, Provider } from "@kaja/schema"

function tomlString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

/** Renders providers+models into the `[providers.*]` / `[[models]]` shape apps/cli/schemas/models.ts expects. */
export function renderModelsToml(providers: Provider[], models: Model[]): string {
  const providerById = new Map(providers.map(p => [p.id, p]))

  const providerBlocks = providers.map(p => {
    const lines = [`[providers.${p.name}]`, `base_url = ${tomlString(p.baseUrl)}`]
    if (p.apiKey) lines.push(`api_key = ${tomlString(p.apiKey)}`)
    return lines.join("\n")
  })

  const modelBlocks = models.map(m => {
    const provider = providerById.get(m.providerId)
    const lines = ["[[models]]", `id = ${tomlString(m.modelId)}`, `task = ${tomlString(m.task)}`]
    if (provider && provider.name !== "default") lines.push(`provider = ${tomlString(provider.name)}`)
    return lines.join("\n")
  })

  return [...providerBlocks, ...modelBlocks].join("\n\n")
}
