import { type SkillFrontmatter, SkillFrontmatterSchema } from "@kaja/schema/abilities"

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/**
 * Splits a SKILL.md into its validated YAML frontmatter and the instruction body. Throws when the frontmatter is
 * missing or invalid, or when its `name` (optional, the Agent Skills spec's) isn't `folder`, the skill's real name.
 */
export function parseSkillMd(text: string, folder?: string): { frontmatter: SkillFrontmatter; body: string } {
  const source = text.replace(/^﻿/, "")
  const match = FRONTMATTER.exec(source)
  if (!match) throw new Error("SKILL.md has no --- frontmatter block")
  const data: unknown = Bun.YAML.parse(match[1]!)
  const parsed = SkillFrontmatterSchema.safeParse(data)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(issue => `${issue.path.join(".") || "frontmatter"}: ${issue.message}`)
    throw new Error(`invalid frontmatter (${issues.join("; ")})`)
  }
  const { name } = parsed.data
  if (name !== undefined && folder !== undefined && name !== folder) {
    throw new Error(`frontmatter name "${name}" isn't the folder's, "${folder}"`)
  }
  return { frontmatter: parsed.data, body: source.slice(match[0].length).trim() }
}
