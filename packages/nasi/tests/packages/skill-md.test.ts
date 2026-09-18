import { expect, test } from "bun:test"
import { parseSkillMd } from "../../src/packages/skill-md"

const skill = (frontmatter: string, body = "Do the thing.") => `---\n${frontmatter}\n---\n\n${body}\n`

test("splits valid frontmatter from the trimmed body", () => {
  const { frontmatter, body } = parseSkillMd(skill("name: pdf\ndescription: Work with PDF files."), "pdf")
  expect(frontmatter).toMatchObject({ name: "pdf", description: "Work with PDF files." })
  expect(body).toBe("Do the thing.")
})

test("keeps unknown frontmatter keys (license, metadata) instead of failing", () => {
  const { frontmatter } = parseSkillMd(skill("name: pdf\ndescription: PDFs.\nlicense: Apache-2.0"))
  expect(frontmatter.license).toBe("Apache-2.0")
})

test("tolerates a BOM and CRLF line endings", () => {
  const { frontmatter, body } = parseSkillMd("﻿---\r\nname: pdf\r\ndescription: PDFs.\r\n---\r\nBody")
  expect(frontmatter.name).toBe("pdf")
  expect(body).toBe("Body")
})

test("rejects a file without frontmatter", () => {
  expect(() => parseSkillMd("# Just markdown")).toThrow("frontmatter")
})

test("rejects a name that doesn't match the folder", () => {
  expect(() => parseSkillMd(skill("name: pdf\ndescription: PDFs."), "docx")).toThrow("doesn't match")
})

test("rejects an invalid name", () => {
  expect(() => parseSkillMd(skill("name: My Skill\ndescription: x"))).toThrow()
  expect(() => parseSkillMd(skill(`name: ${"a".repeat(65)}\ndescription: x`))).toThrow()
})

test("rejects a missing or too long description", () => {
  expect(() => parseSkillMd(skill("name: pdf"))).toThrow()
  expect(() => parseSkillMd(skill(`name: pdf\ndescription: ${"x".repeat(1025)}`))).toThrow()
})
