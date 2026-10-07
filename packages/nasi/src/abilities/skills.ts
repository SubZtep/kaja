import type { Persona } from "@kaja/schema/cli"
import { z } from "zod"
import { type Tool, tool } from "../agent/tools"
import { skillMode } from "./persona-scope"
import { type AbilityStore, SkillFileError, type SkillSummary } from "./types"

export const LOAD_SKILL_TOOL = "load_skill"

const LoadSkillArgsSchema = z.object({
  name: z.string().describe("Name of the skill"),
  file: z
    .string()
    .optional()
    .describe("Optional path of another file in the skill, relative to its folder (e.g. reference.md)")
})
type LoadSkillArgs = z.output<typeof LoadSkillArgsSchema>

/** The load_skill tool, carrying the skill catalog it serves (and a way to read a body) so the system prompt can list the same skills and inline the sticky ones. */
export type LoadSkillTool = Tool<LoadSkillArgs> & {
  skills: SkillSummary[]
  /** A skill's SKILL.md body, for a persona that keeps it in the system prompt. */
  readBody: (name: string) => Promise<string | undefined>
}

/** Skills a persona lists for load_skill (see {@link skillMode}); without a persona, every one of them. */
export function skillsForPersona(skills: SkillSummary[], persona?: Pick<Persona, "abilities">): SkillSummary[] {
  if (!persona) return skills
  return skills.filter(skill => skillMode(skill, persona) === "load")
}

/** Skills a persona keeps in the system prompt (`sticky`); none without a persona. */
export function stickySkillsForPersona(skills: SkillSummary[], persona?: Pick<Persona, "abilities">): SkillSummary[] {
  if (!persona) return []
  return skills.filter(skill => skillMode(skill, persona) === "sticky")
}

function skillHeader(skill: SkillSummary): string {
  const lines = [`# Skill: ${skill.name}`]
  if (skill.dir) lines.push(`Skill directory: ${skill.dir}`)
  if (skill.files.length > 0) lines.push(`Other files (load with file=<path>): ${skill.files.join(", ")}`)
  return lines.join("\n")
}

/** Builds load_skill over `skills`, serving only the active persona's skills (load or sticky, see {@link skillMode}) at call time. */
export function createLoadSkillTool(opts: {
  store: AbilityStore
  skills: SkillSummary[]
  personas?: Persona[]
}): LoadSkillTool {
  const personaById = new Map((opts.personas ?? []).map(p => [p.id, p]))

  const loadSkill = tool({
    name: LOAD_SKILL_TOOL,
    description:
      "Load a skill's instructions (see ## Skills in your system prompt) before starting a task it covers. " +
      "Pass `file` to read one of the skill's other files, only when its instructions point to it.",
    schema: LoadSkillArgsSchema,
    // Problems come back as text rather than a thrown ToolError, so the model can pick another skill or file instead of the turn failing.
    execute: async (args, ctx) => {
      const persona = personaById.get(ctx?.personaId ?? "")
      const allowed = persona ? opts.skills.filter(skill => skillMode(skill, persona) !== "off") : opts.skills
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

  return { ...loadSkill, skills: opts.skills, readBody: name => opts.store.readSkill(name) }
}
