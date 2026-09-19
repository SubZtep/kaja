import { type PackageStore, parseSkillMd } from "@kaja/nasi"
import { packageService } from "../../services"
import type { CloudSkill } from "../../services/package"

const SKILL_FILE = "SKILL.md"

/** Whose skills a cloud turn gets: the user's own selections, or a widget key's list. */
export type CloudPackageSource = { userId: string } | { skills: string[] }

/**
 * {@link PackageStore} over the `package` table for one cloud turn: skills, HTTP tools and remote MCP
 * servers. Skill files come from the stored bundle, so there's no disk and no skill folder path,
 * and skills with scripts never get here (the catalog doesn't offer them). A widget key's list is skills
 * only, so no visitor ever calls a tool or MCP server with the owner's key.
 */
export function createPostgresPackageStore(source: CloudPackageSource): PackageStore {
  let loaded: Promise<CloudSkill[]> | undefined
  const skills = () =>
    (loaded ??=
      "userId" in source ? packageService.skillsForUser(source.userId) : packageService.skillsByName(source.skills))

  return {
    async listSkills() {
      return (await skills()).map(skill => ({
        name: skill.name,
        description: skill.description,
        files: Object.keys(skill.files)
          .filter(path => path !== SKILL_FILE)
          .sort()
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

    listHttpTools: async () => ("userId" in source ? packageService.httpToolsForUser(source.userId) : []),
    listMcpPackages: async () => ("userId" in source ? packageService.mcpForUser(source.userId) : [])
  }
}
