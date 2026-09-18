import * as z from "zod"

/** Agent Skills naming rule: lowercase letters/digits separated by single hyphens, and must match the skill's folder name. */
export const SkillNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens only")

// SKILL.md frontmatter; loose so upstream extras (license, allowed-tools, metadata) don't fail validation.
export const SkillFrontmatterSchema = z.looseObject({
  name: SkillNameSchema,
  /** What the skill does and when to use it — the only part the model sees before calling load_skill. */
  description: z.string().min(1).max(1024)
})

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>
