import type { Persona } from "@kaja/schema/cli"
import { type Tool, tool } from "../agent/tools"
import { type PackageStore, SkillFileError, type SkillSummary } from "./types"

export const LOAD_SKILL_TOOL = "load_skill"

type LoadSkillArgs = { name: string; file?: string }

/** The load_skill tool, carrying the skill catalog it serves so the system prompt can list the same skills. */
export type LoadSkillTool = Tool<LoadSkillArgs> & { skills: SkillSummary[] }

/** Skills a persona may use: its `skills` list (limited to what's enabled) when set, otherwise all of them. */
export function skillsForPersona(skills: SkillSummary[], persona?: Pick<Persona, "skills">): SkillSummary[] {
  if (!persona?.skills) return skills
  const allowed = new Set(persona.skills)
  return skills.filter(s => allowed.has(s.name))
}

function skillHeader(skill: SkillSummary): string {
  const lines = [`# Skill: ${skill.name}`]
  if (skill.dir) lines.push(`Skill directory: ${skill.dir}`)
  if (skill.files.length > 0) lines.push(`Other files (load with file=<path>): ${skill.files.join(", ")}`)
  return lines.join("\n")
}

/** Builds load_skill over `skills`, enforcing the active persona's limit (see {@link skillsForPersona}) at call time. */
export function createLoadSkillTool(opts: {
  store: PackageStore
  skills: SkillSummary[]
  personas?: Persona[]
}): LoadSkillTool {
  const personaById = new Map((opts.personas ?? []).map(p => [p.id, p]))

  const loadSkill = tool<LoadSkillArgs>({
    name: LOAD_SKILL_TOOL,
    description:
      "Load a skill's instructions (see ## Skills in your system prompt) before starting a task it covers. " +
      "Pass `file` to read one of the skill's other files, only when its instructions point to it.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the skill" },
        file: {
          type: "string",
          description: "Optional path of another file in the skill, relative to its folder (e.g. reference.md)"
        }
      },
      required: ["name"]
    },
    // Problems come back as text rather than a thrown ToolError, so the model can pick another skill or file instead of the turn failing.
    execute: async (args, ctx) => {
      const allowed = skillsForPersona(opts.skills, personaById.get(ctx?.personaId ?? ""))
      const skill = allowed.find(s => s.name === args.name)
      if (!skill) {
        const names = allowed.map(s => s.name).join(", ") || "none"
        return `No skill named "${args.name}" is available. Available skills: ${names}.`
      }

      try {
        const text = await opts.store.readSkill(skill.name, args.file)
        if (text === undefined) {
          return args.file
            ? `Skill "${skill.name}" has no file "${args.file}". Its files: ${skill.files.join(", ") || "none"}.`
            : `Skill "${skill.name}" could not be read.`
        }
        return args.file ? text : `${skillHeader(skill)}\n\n${text}`
      } catch (error) {
        if (error instanceof SkillFileError) return `Error: ${error.message}`
        throw error
      }
    }
  })

  return { ...loadSkill, skills: opts.skills }
}
