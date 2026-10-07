import * as z from "zod"

/** Agent Skills naming rule: lowercase letters/digits separated by single hyphens; an ability's name is its folder's (marketplace/abilities/<name>/). */
export const SkillNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens only")

// SKILL.md frontmatter; loose so upstream extras (license, allowed-tools, metadata) don't fail validation. No `name`: the folder name is the skill's.
export const SkillFrontmatterSchema = z.looseObject({
  /** What the skill does and when to use it — the only part the model sees before calling load_skill. */
  description: z.string().min(1).max(1024),
  /** Suggests keeping the body in the system prompt while a persona uses the ability; the persona decides. */
  sticky: z.boolean().optional()
})

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>
