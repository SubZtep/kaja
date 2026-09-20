import { expect, test } from "bun:test"
import { join } from "node:path"
import { readSkillBundle, scanSkills } from "../../src/abilities/folder-store"

// The repo's own marketplace/, as users and the cloud sync get it.
const marketplace = join(import.meta.dir, "../../../../marketplace")

test("every skill shipped in marketplace/ loads", async () => {
  const skills = await scanSkills(marketplace)
  expect(skills.length).toBeGreaterThan(0)
  for (const skill of skills) expect(skill.error).toBeUndefined()
})

test("at least one shipped skill has no scripts, so the cloud catalog isn't empty", async () => {
  const bundles = await Promise.all(
    (await scanSkills(marketplace)).map(skill => readSkillBundle(marketplace, skill.name))
  )
  expect(bundles.filter(bundle => !bundle.hasScripts).map(bundle => bundle.name)).toContain("meeting-notes")
})
