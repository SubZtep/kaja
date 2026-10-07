import { type SkillFrontmatter, SkillFrontmatterSchema } from "@kaja/schema/abilities"

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/**
 * Splits a SKILL.md into its validated YAML frontmatter and the instruction body.
 * Throws when the frontmatter is missing or invalid, or has a `name` (the folder name is the skill's).
 */
export function parseSkillMd(text: string): { frontmatter: SkillFrontmatter; body: string } {
  const source = text.replace(/^﻿/, "")
  const match = FRONTMATTER.exec(source)
  if (!match) throw new Error("SKILL.md has no --- frontmatter block")
  const data: unknown = Bun.YAML.parse(match[1]!)
  if (data && typeof data === "object" && "name" in data) {
    throw new Error("frontmatter has a `name`: the folder name is the skill's, so leave it out")
  }
  const parsed = SkillFrontmatterSchema.safeParse(data)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(issue => `${issue.path.join(".") || "frontmatter"}: ${issue.message}`)
    throw new Error(`invalid frontmatter (${issues.join("; ")})`)
  }
  return { frontmatter: parsed.data, body: source.slice(match[0].length).trim() }
}
