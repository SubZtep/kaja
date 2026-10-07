import * as z from "zod"
import { SkillNameSchema } from "./skill"

/** Optional chat completion sampling overrides; unset means provider default. Shared with lib/agents.ts's Agent.sampling. */
export const SamplingParamsSchema = z.object({
  /** Randomness of token selection, 0 (deterministic) to 2 (most random). */
  temperature: z.number().min(0).max(2).optional(),
  /** Nucleus sampling threshold: only tokens in the top `top_p` probability mass are considered. */
  top_p: z.number().min(0).max(1).optional(),
  /** Limits sampling to the `top_k` most likely tokens at each step; not supported by all providers. */
  top_k: z.number().int().positive().optional(),
  /** Maximum number of tokens to generate in the completion. */
  max_tokens: z.number().int().positive().optional(),
  /** Penalizes tokens by how often they've already appeared, -2 to 2; positive values discourage repetition. */
  frequency_penalty: z.number().min(-2).max(2).optional(),
  /** Penalizes tokens that have appeared at all so far, -2 to 2; positive values encourage new topics. */
  presence_penalty: z.number().min(-2).max(2).optional(),
  /** Fixes the sampling seed for (best-effort) reproducible outputs across requests. */
  seed: z.number().int().optional()
})

// Each value is a models.toml [models.<id>] entry's id; unset or unresolved
// falls back to models.toml's first model listing that task (see resolveActiveModel).
const PersonaModelsSchema = z
  .object({
    chat: z.string().min(1).optional(),
    embedding: z.string().min(1).optional(),
    rerank: z.string().min(1).optional(),
    "image-generation": z.string().min(1).optional(),
    tts: z.string().min(1).optional(),
    stt: z.string().min(1).optional(),
    summarize: z.string().min(1).optional()
  })
  .optional()

/** How a persona uses an ability's skill: listed for load_skill (`load`), always in the system prompt (`sticky`), or left out (`off`). */
export const SkillModeSchema = z.enum(["load", "sticky", "off"])

// One `roots` folder: a path (writable), or a table that can make it read-only or backed up.
const PersonaRootSchema = z.union([
  z.string().min(1),
  z.object({
    path: z.string().min(1),
    readOnly: z.boolean().default(false).describe("The server may read here but not write, edit, move or create"),
    backup: z
      .boolean()
      .optional()
      .describe("Kaja copies a file here to its backups folder before the server writes, edits or moves it")
  })
])

// One `abilities` entry: a name uses every part of the ability; a table tweaks it.
const PersonaAbilitySchema = z.union([
  SkillNameSchema,
  z.object({
    name: SkillNameSchema,
    skill: SkillModeSchema.optional().describe(
      "The skill part: load (default, unless SKILL.md says sticky), sticky or off"
    ),
    tools: z
      .array(z.string().min(1))
      .optional()
      .describe("Only these of the ability's tools (HTTP, MCP and code tools); unset means all of them"),
    roots: z
      .array(PersonaRootSchema)
      .optional()
      .describe(
        'Folders an MCP server with `roots = true` may use while this persona is active, e.g. ["~/notes", { path = "~/site", readOnly = true }]; without them it\'s off'
      )
  })
])

// A marketplace persona, marketplace/personas/<id>.toml; the id comes from the file name (the ability name rule), attached by the loader.
export const PersonaSchema = z
  .object({
    label: z.string().min(1),
    instructions: z.string().min(1).optional().describe("System prompt"),
    // Per-task model overrides; each optional, falls back to models.toml's first model listing that task.
    models: PersonaModelsSchema,
    // Topic id (datasets.ts filename) this persona collects via dataset_info; optional.
    dataset: z.string().min(1).optional(),
    // Short clause describing when this persona fits; shown in the system-prompt persona roster.
    when: z.string().min(1).optional(),
    // The abilities this persona uses (skills, HTTP tools, MCP servers, code tools), by folder name; unset means builtins only.
    abilities: z.array(PersonaAbilitySchema).optional()
  })
  .extend(SamplingParamsSchema.shape)

export type Persona = z.infer<typeof PersonaSchema> & { id: string }
export type PersonaAbility = z.infer<typeof PersonaAbilitySchema>
export type PersonaRoot = z.infer<typeof PersonaRootSchema>
export type SkillMode = z.infer<typeof SkillModeSchema>
export type PersonaModels = NonNullable<z.infer<typeof PersonaModelsSchema>>
export type SamplingParams = z.infer<typeof SamplingParamsSchema>
