import { expect, test } from "bun:test"
import { parseSkillMd } from "../../src/abilities/skill-md"

const skill = (frontmatter: string, body = "Do the thing.") => `---\n${frontmatter}\n---\n\n${body}\n`

test("splits valid frontmatter from the trimmed body", () => {
  const { frontmatter, body } = parseSkillMd(skill("description: Work with PDF files."))
  expect(frontmatter).toMatchObject({ description: "Work with PDF files." })
  expect(body).toBe("Do the thing.")
})

test("keeps unknown frontmatter keys (license, metadata) instead of failing", () => {
  const { frontmatter } = parseSkillMd(skill("description: PDFs.\nlicense: Apache-2.0"))
  expect(frontmatter.license).toBe("Apache-2.0")
})

test("reads the sticky suggestion", () => {
  expect(parseSkillMd(skill("description: PDFs.\nsticky: true")).frontmatter.sticky).toBe(true)
  expect(parseSkillMd(skill("description: PDFs.")).frontmatter.sticky).toBeUndefined()
  expect(() => parseSkillMd(skill("description: PDFs.\nsticky: often"))).toThrow()
})

test("tolerates a BOM and CRLF line endings", () => {
  const { frontmatter, body } = parseSkillMd("﻿---\r\ndescription: PDFs.\r\n---\r\nBody")
  expect(frontmatter.description).toBe("PDFs.")
  expect(body).toBe("Body")
})

test("rejects a file without frontmatter", () => {
  expect(() => parseSkillMd("# Just markdown")).toThrow("frontmatter")
})

test("rejects a name: the folder name is the skill's", () => {
  expect(() => parseSkillMd(skill("name: pdf\ndescription: PDFs."))).toThrow("folder name")
})

test("rejects a missing or too long description", () => {
  expect(() => parseSkillMd(skill("license: MIT"))).toThrow()
  expect(() => parseSkillMd(skill(`description: ${"x".repeat(1025)}`))).toThrow()
})
