import type { AbilityType } from "@kaja/schema/api"

const MARKETPLACE = "https://github.com/SubZtep/kaja/tree/main/marketplace"

/** Where an ability's manifest lives on GitHub: a skill's folder (SKILL.md and its files), or the other types' TOML. */
export function abilitySourceUrl(type: AbilityType, name: string): string {
  const path = name.replaceAll(/[^\w.-]/g, "")
  if (type === "skill") return `${MARKETPLACE}/skills/${path}`
  const folder = type === "persona" ? "personas" : type === "tool" ? "tools" : "mcp"
  return `${MARKETPLACE}/${folder}/${path}.toml`
}
