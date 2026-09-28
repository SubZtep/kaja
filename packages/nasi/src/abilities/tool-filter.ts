import type { HttpToolAbility, McpAbility } from "@kaja/schema/abilities"

/** An HTTP tool ability without the named tools; undefined when none are left, so the whole ability stays out. */
export function withoutHttpTools(ability: HttpToolAbility, off: readonly string[]): HttpToolAbility | undefined {
  if (off.length === 0) return ability
  const tools = ability.tools.filter(tool => !off.includes(tool.name))
  return tools.length ? { ...ability, tools } : undefined
}

/** An MCP ability without the named tools, taken from its `tools` list; undefined when none are left. One without a list (every server tool) has nothing to take from, so it stays as it is. */
export function withoutMcpTools(ability: McpAbility, off: readonly string[]): McpAbility | undefined {
  if (off.length === 0 || !ability.tools) return ability
  const tools = ability.tools.filter(tool => !off.includes(tool))
  return tools.length ? { ...ability, tools } : undefined
}
