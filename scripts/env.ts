import { join } from "node:path"
import type { z } from "zod"
import { ApiEnvSchema, SandboxEnvSchema, WebEnvSchema } from "../packages/schema/env"
import { type FieldInfo, inspectFields } from "./lib/env-schema"

const rootDir = join(import.meta.dir, "..")

/** Required fields are active, optional ones commented out; an optional field with no value to show is left out. */
function renderLine(field: FieldInfo): string | undefined {
  const comment = field.description ? `   # ${field.description}` : ""

  if (!field.isOptional) {
    if (field.example === undefined) throw new Error(`${field.key} is required but has no example`)
    return `${field.key}=${field.example}${comment}`
  }

  // A devDefault is optional but needed by a fresh checkout's dev, tests and CI.
  if (field.devDefault && field.example !== undefined) return `${field.key}=${field.example}${comment}`

  const value = field.defaultValue ?? field.example
  if (value !== undefined) return `# ${field.key}=${value}${comment}`
}

function renderEnvExample(schema: z.ZodObject<z.ZodRawShape>): string {
  const fields = inspectFields(schema)
  const sections = new Map<string | undefined, string[]>()
  for (const field of fields) {
    const line = renderLine(field)
    if (line === undefined) continue
    const bucket = sections.get(field.section) ?? []
    bucket.push(line)
    sections.set(field.section, bucket)
  }

  const blocks: string[] = []
  const unsectioned = sections.get(undefined)
  if (unsectioned) blocks.push(unsectioned.join("\n"))
  for (const [section, sectionLines] of sections) {
    if (section === undefined) continue
    blocks.push(`# ${section}\n${sectionLines.join("\n")}`)
  }

  return `${blocks.join("\n\n")}\n`
}

const targets = [
  { schema: ApiEnvSchema, outPath: join(rootDir, "apps/api/.env.example") },
  { schema: WebEnvSchema, outPath: join(rootDir, "apps/web/.env.example") },
  { schema: SandboxEnvSchema, outPath: join(rootDir, "apps/sandbox/.env.example") }
]

const knownKeys = new Set(targets.flatMap(t => Object.keys(t.schema.shape)))

/**
 * Only checks the `api`/`web`/`sandbox` services — `db`'s environment block configures the Postgres image, not our app
 * schemas.
 */
async function extractComposeOverrideKeys(): Promise<string[]> {
  const content = await Bun.file(join(rootDir, "compose.yaml")).text()
  const lines = content.split("\n")
  const keys: string[] = []
  let currentService: string | undefined
  let inEnvBlock = false
  let envBlockIndent = 0

  for (const line of lines) {
    const serviceMatch = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line)
    if (serviceMatch) {
      currentService = serviceMatch[1]
      inEnvBlock = false
      continue
    }

    const envMatch = /^(\s+)environment:\s*$/.exec(line)
    if (envMatch) {
      inEnvBlock = currentService === "api" || currentService === "web" || currentService === "sandbox"
      envBlockIndent = envMatch[1]!.length
      continue
    }
    if (inEnvBlock) {
      const indentMatch = /^(\s*)/.exec(line)
      const indent = indentMatch![1]!.length
      if (line.trim() === "" || indent <= envBlockIndent) {
        inEnvBlock = false
        continue
      }
      const keyMatch = /^\s+([A-Z][A-Z0-9_]*):/.exec(line)
      if (keyMatch) keys.push(keyMatch[1]!)
    }
  }
  return keys
}

const isCheck = process.argv.includes("--check")

if (isCheck) {
  let hasDiff = false

  for (const target of targets) {
    const generated = renderEnvExample(target.schema)
    const onDisk = await Bun.file(target.outPath)
      .text()
      .catch(() => "")
    if (generated !== onDisk) {
      hasDiff = true
      console.error(`✗ ${target.outPath} is out of date — run \`bun generate:env\``)
    } else {
      console.log(`✓ ${target.outPath} is up to date`)
    }
  }

  const composeKeys = await extractComposeOverrideKeys()
  const unknownComposeKeys = composeKeys.filter(key => !knownKeys.has(key))
  if (unknownComposeKeys.length > 0) {
    hasDiff = true
    console.error(`✗ compose.yaml references unknown env key(s): ${unknownComposeKeys.join(", ")}`)
  }

  if (hasDiff) process.exit(1)
  console.log("env schemas and .env.example files are in sync")
} else {
  for (const target of targets) {
    const generated = renderEnvExample(target.schema)
    await Bun.write(target.outPath, generated)
    console.log(`Wrote ${target.outPath}`)
  }
}
