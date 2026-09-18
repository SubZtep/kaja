import { type SkillFrontmatter, SkillFrontmatterSchema } from "@kaja/schema/packages"

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/**
 * Splits a SKILL.md into its validated YAML frontmatter and the instruction body.
 * Throws when the frontmatter is missing or invalid, or its `name` isn't `folderName`.
 */
export function parseSkillMd(text: string, folderName?: string): { frontmatter: SkillFrontmatter; body: string } {
  const source = text.replace(/^﻿/, "")
  const match = FRONTMATTER.exec(source)
  if (!match) throw new Error("SKILL.md has no --- frontmatter block")
  const parsed = SkillFrontmatterSchema.safeParse(Bun.YAML.parse(match[1]!))
  if (!parsed.success) {
    const issues = parsed.error.issues.map(issue => `${issue.path.join(".") || "frontmatter"}: ${issue.message}`)
    throw new Error(`invalid frontmatter (${issues.join("; ")})`)
  }
  const frontmatter = parsed.data
  if (folderName !== undefined && frontmatter.name !== folderName) {
    throw new Error(`frontmatter name "${frontmatter.name}" doesn't match its folder "${folderName}"`)
  }
  return { frontmatter, body: source.slice(match[0].length).trim() }
}
