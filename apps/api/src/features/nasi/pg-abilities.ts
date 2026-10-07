import { type AbilityStore, parseSkillMd } from "@kaja/nasi"
import { abilityService } from "../../services"
import type { CloudSkill } from "../../services/ability"

const SKILL_FILE = "SKILL.md"

/** Whose abilities a cloud turn gets: a user's own turn gets every ability (and their keys), a widget's skills only. */
export type CloudAbilitySource = { userId: string } | { skillsOnly: true }

/**
 * {@link AbilityStore} over the `ability` table for one cloud turn: every available skill, HTTP tool and MCP server
 * (the turn's persona picks which it uses). Skill files come from the stored bundle, so there's no disk and no
 * skill folder path, and skills with scripts never get here. A widget's source is skills only, so no visitor ever
 * calls a tool or MCP server with the owner's key.
 */
export function createPostgresAbilityStore(source: CloudAbilitySource): AbilityStore {
  let loaded: Promise<CloudSkill[]> | undefined
  const skills = () => (loaded ??= abilityService.skills())

  return {
    async listSkills() {
      return (await skills()).map(skill => ({
        name: skill.name,
        description: skill.description,
        files: Object.keys(skill.files)
          .filter(path => path !== SKILL_FILE)
          .sort((a, b) => a.localeCompare(b))
      }))
    },

    async readSkill(name, file) {
      const skill = (await skills()).find(candidate => candidate.name === name)
      if (!skill) return undefined
      if (file === undefined) {
        try {
          return parseSkillMd(skill.files[SKILL_FILE] ?? "", name).body
        } catch {
          return undefined
        }
      }
      // Keys are the stored relative paths; match exactly, then case-insensitively (skills say REFERENCE.md for reference.md).
      const wanted = file.replace(/^\.\//, "")
      const key =
        wanted in skill.files
          ? wanted
          : Object.keys(skill.files).find(path => path.toLowerCase() === wanted.toLowerCase())
      return key ? skill.files[key] : undefined
    },

    listHttpTools: async () => ("userId" in source ? abilityService.httpTools() : []),
    listMcpAbilities: async () => ("userId" in source ? abilityService.mcpAbilities() : [])
  }
}
