import { readdir, readFile, realpath, stat } from "node:fs/promises"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import {
  type Dataset,
  DatasetSchema,
  type HttpToolAbility,
  HttpToolAbilitySchema,
  type McpAbility,
  McpAbilitySchema,
  type Persona,
  PersonaSchema,
  SkillNameSchema
} from "@kaja/schema/abilities"
import type * as z from "zod"
import { warn } from "../warn"
import { parseSkillMd } from "./skill-md"
import { type AbilityStore, SkillFileError, type SkillSummary } from "./types"

const SKILL_FILE = "SKILL.md"
const MAX_LISTED_FILES = 200
const MAX_FILE_BYTES = 256 * 1024
// Dotfiles and the .bak/.bak2 backups a marketplace sync leaves behind never reach the model.
const HIDDEN = /^\.|\.bak\d*$/

export type FolderAbilityStoreOptions = {
  /** The marketplace folder; skills live in `<root>/skills/<name>/`. */
  root: string
  /** Ability names the host enabled (abilities.toml) — only these load. */
  enabled: { skills: string[]; tools?: string[]; mcp?: string[] }
}

/** Every file under a skill folder except SKILL.md and hidden/backup files, relative with `/` separators, sorted and capped. */
async function listSkillFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const walk = async (rel: string) => {
    let entries
    try {
      entries = await readdir(join(dir, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= MAX_LISTED_FILES) return
      if (HIDDEN.test(entry.name)) continue
      const path = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) await walk(path)
      else if (path !== SKILL_FILE) files.push(path)
    }
  }
  await walk("")
  return files
}

async function readSkillFolder(skillsRoot: string, name: string): Promise<{ summary: SkillSummary; body: string }> {
  if (!SkillNameSchema.safeParse(name).success) throw new Error(`"${name}" is not a valid skill name`)
  const dir = join(skillsRoot, name)
  let text: string
  try {
    text = await readFile(join(dir, SKILL_FILE), "utf8")
  } catch {
    throw new Error(`no ${SKILL_FILE} in ${dir}`)
  }
  const { frontmatter, body } = parseSkillMd(text, name)
  return { summary: { name, description: frontmatter.description, dir, files: await listSkillFiles(dir) }, body }
}

/** Finds `file` inside `dir`, falling back to a case-insensitive match (skills often say REFERENCE.md for reference.md). */
async function findSkillFile(dir: string, rel: string): Promise<string | undefined> {
  const exact = join(dir, rel)
  if (await stat(exact).catch(() => undefined)) return exact
  const wanted = rel.split(sep).join("/").toLowerCase()
  const match = [SKILL_FILE, ...(await listSkillFiles(dir))].find(f => f.toLowerCase() === wanted)
  return match ? join(dir, match) : undefined
}

async function readConfinedFile(dir: string, file: string): Promise<string | undefined> {
  const rel = relative(dir, resolve(dir, file))
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new SkillFileError(`"${file}" is outside the skill folder`)
  }
  if (rel.split(sep).some(segment => HIDDEN.test(segment))) return undefined

  const path = await findSkillFile(dir, rel)
  if (!path) return undefined

  // realpath on both sides, so a symlink inside the skill can't point the read somewhere else.
  const [realDir, realPath] = await Promise.all([realpath(dir), realpath(path).catch(() => undefined)])
  if (!realPath) return undefined
  if (!realPath.startsWith(`${realDir}${sep}`)) throw new SkillFileError(`"${file}" is outside the skill folder`)

  const info = await stat(realPath)
  if (!info.isFile()) return undefined
  if (info.size > MAX_FILE_BYTES) throw new SkillFileError(`"${file}" is too large (>${MAX_FILE_BYTES} bytes)`)
  const bytes = await readFile(realPath)
  if (bytes.includes(0)) throw new SkillFileError(`"${file}" is a binary file`)
  return bytes.toString("utf8")
}

/** Parses a TOML manifest's text against `schema`, throwing with the reason when it's invalid. */
function parseToml<T>(text: string, schema: z.ZodType<T>): T {
  let data: unknown
  try {
    data = Bun.TOML.parse(text)
  } catch (error) {
    throw new Error(`invalid TOML (${error instanceof Error ? error.message : String(error)})`)
  }
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(issue => `${issue.path.join(".") || "file"}: ${issue.message}`)
    throw new Error(`invalid manifest (${issues.join("; ")})`)
  }
  return parsed.data
}

/** Parses a `<name>.toml` manifest's text against `schema`; the manifest's own `name` must match the file name. */
function parseManifest<T extends { name: string }>(text: string, name: string, schema: z.ZodType<T>): T {
  const data = parseToml(text, schema)
  if (data.name !== name) throw new Error(`name "${data.name}" doesn't match its file "${name}.toml"`)
  return data
}

/** An HTTP tool manifest from its TOML text (the cloud keeps the text, not the file). Throws with the reason when it's invalid. */
export function parseHttpToolManifest(text: string, name: string): HttpToolAbility {
  return parseManifest(text, name, HttpToolAbilitySchema)
}

/** An MCP ability manifest from its TOML text (the cloud keeps the text, not the file). Throws with the reason when it's invalid. */
export function parseMcpManifest(text: string, name: string): McpAbility {
  return parseManifest(text, name, McpAbilitySchema)
}

/** A persona from its TOML text (the cloud keeps the text, not the file); personas have no `name`, the id is the file name. */
export function parsePersonaManifest(text: string, id: string): Persona {
  return { ...parseToml(text, PersonaSchema), id }
}

/** The text of `<dir>/<name>.toml`, once `name` passes the ability name rule. */
async function readManifestText(dir: string, name: string): Promise<string> {
  if (!SkillNameSchema.safeParse(name).success) throw new Error(`"${name}" is not a valid ability name`)
  const path = join(dir, `${name}.toml`)
  try {
    return await readFile(path, "utf8")
  } catch {
    throw new Error(`no ${path}`)
  }
}

/** Reads `<dir>/<name>.toml` against `schema`; the manifest's own `name` must match the file name. */
async function readManifest<T extends { name: string }>(dir: string, name: string, schema: z.ZodType<T>): Promise<T> {
  return parseManifest(await readManifestText(dir, name), name, schema)
}

/** Names of the `*<ext>` manifests in a folder, sorted, hidden and backup files skipped; empty when the folder is missing. */
async function manifestNames(dir: string, ext = ".toml"): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith(ext) && !HIDDEN.test(entry.name))
    .map(entry => entry.name.slice(0, -ext.length))
    .sort((a, b) => a.localeCompare(b))
}

/** Enabled manifests that parse; broken ones are skipped with a warning. */
async function readEnabled<T>(
  names: string[] | undefined,
  read: (name: string) => Promise<T>,
  what: string
): Promise<T[]> {
  const found: T[] = []
  for (const name of new Set(names ?? [])) {
    try {
      found.push(await read(name))
    } catch (error) {
      warn(`Skipping enabled ${what}`, { ability: name, error: error instanceof Error ? error.message : error })
    }
  }
  return found
}

/** Where an ability's key goes, for showing before enabling it. */
export type AbilityKeyNeed = { in: "header" | "query" | "env"; name: string; optional: boolean }

/** One HTTP tool ability found on disk, loadable or not — what a picker shows. */
export type HttpToolScanEntry = {
  name: string
  description?: string
  /** Host the ability calls, shown before enabling. */
  domain?: string
  /** Where its key goes, or undefined when it needs none. */
  auth?: AbilityKeyNeed
  error?: string
}

/** Every `<root>/tools/*.toml`, enabled or not, with its domain and auth or why it can't load. Sorted by name. */
export async function scanHttpTools(root: string): Promise<HttpToolScanEntry[]> {
  const dir = join(resolve(root), "tools")
  return Promise.all(
    (await manifestNames(dir)).map(async name => {
      try {
        const ability = await readManifest(dir, name, HttpToolAbilitySchema)
        return {
          name,
          description: ability.description,
          domain: new URL(ability.baseUrl).host,
          auth:
            ability.auth.type === "apiKey"
              ? { in: ability.auth.in, name: ability.auth.name, optional: ability.auth.optional }
              : undefined
        }
      } catch (error) {
        return { name, error: error instanceof Error ? error.message : String(error) }
      }
    })
  )
}

/** One MCP ability found on disk, loadable or not — what a picker shows. */
export type McpScanEntry = {
  name: string
  description?: string
  transport?: McpAbility["transport"]
  /** Host of a remote server. */
  domain?: string
  /** The full command line of a stdio server, shown (and confirmed) before enabling. */
  command?: string
  auth?: AbilityKeyNeed
  error?: string
}

/** Every `<root>/mcp/*.toml`, enabled or not, with where it connects (or what it runs) and its key need. Sorted by name. */
export async function scanMcpAbilities(root: string): Promise<McpScanEntry[]> {
  const dir = join(resolve(root), "mcp")
  return Promise.all(
    (await manifestNames(dir)).map(async name => {
      try {
        const ability = await readManifest(dir, name, McpAbilitySchema)
        return {
          name,
          description: ability.description,
          transport: ability.transport,
          ...(ability.url
            ? { domain: new URL(ability.url).host }
            : { command: [ability.command, ...ability.args].join(" ") }),
          auth:
            ability.auth.type === "apiKey"
              ? { in: ability.auth.in, name: ability.auth.name, optional: ability.auth.optional }
              : undefined
        }
      } catch (error) {
        return { name, error: error instanceof Error ? error.message : String(error) }
      }
    })
  )
}

/** One skill folder found on disk, loadable or not — what a picker shows. */
export type SkillScanEntry = { name: string; description?: string; error?: string }

/** Every folder under `<root>/skills/`, enabled or not, with its description or why it can't load. Sorted by name; a missing root is an empty list. */
export async function scanSkills(root: string): Promise<SkillScanEntry[]> {
  const skillsRoot = join(resolve(root), "skills")
  let entries
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true })
  } catch {
    return []
  }
  const names = entries
    .filter(entry => (entry.isDirectory() || entry.isSymbolicLink()) && !HIDDEN.test(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b))
  return Promise.all(
    names.map(async name => {
      try {
        return { name, description: (await readSkillFolder(skillsRoot, name)).summary.description }
      } catch (error) {
        return { name, error: error instanceof Error ? error.message : String(error) }
      }
    })
  )
}

/** The personas in `<root>/personas/` named in `ids`, in that order; broken or missing ones are skipped with a warning. */
export function readPersonas(root: string, ids: string[]): Promise<Persona[]> {
  const dir = join(resolve(root), "personas")
  return readEnabled(ids, async id => parsePersonaManifest(await readManifestText(dir, id), id), "persona")
}

/** A dataset from its JSON text (the cloud keeps the text, not the file). Throws with the reason when it's invalid. */
export function parseDatasetManifest(text: string): Dataset {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new Error(`invalid JSON (${error instanceof Error ? error.message : String(error)})`)
  }
  const parsed = DatasetSchema.safeParse(data)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(issue => `${issue.path.join(".") || "file"}: ${issue.message}`)
    throw new Error(`invalid dataset (${issues.join("; ")})`)
  }
  return parsed.data
}

/** One dataset file found on disk, loadable or not. */
export type DatasetScanEntry = { name: string; label?: string; error?: string }

/** Every `<root>/datasets/*.json`, with its label or why it can't load. Sorted by topic; a missing folder is an empty list. */
export async function scanDatasets(root: string): Promise<DatasetScanEntry[]> {
  const dir = join(resolve(root), "datasets")
  return Promise.all(
    (await manifestNames(dir, ".json")).map(async name => {
      try {
        return { name, label: (await readDatasetFile(dir, name)).label }
      } catch (error) {
        return { name, error: error instanceof Error ? error.message : String(error) }
      }
    })
  )
}

/** Every valid dataset in `<root>/datasets/`, by topic (the file name); broken ones are skipped with a warning. */
export async function readDatasets(root: string): Promise<Map<string, Dataset>> {
  const dir = join(resolve(root), "datasets")
  const datasets = new Map<string, Dataset>()
  for (const name of await manifestNames(dir, ".json")) {
    try {
      datasets.set(name, await readDatasetFile(dir, name))
    } catch (error) {
      warn("Skipping dataset", { dataset: name, error: error instanceof Error ? error.message : error })
    }
  }
  return datasets
}

async function readDatasetFile(dir: string, name: string): Promise<Dataset> {
  if (!SkillNameSchema.safeParse(name).success) throw new Error(`"${name}" is not a valid ability name`)
  return parseDatasetManifest(await readFile(join(dir, `${name}.json`), "utf8"))
}

/** One persona file found on disk, loadable or not — what a picker shows. */
export type PersonaScanEntry = { name: string; label?: string; when?: string; error?: string }

/** Every `<root>/personas/*.toml`, enabled or not, with its label and `when` or why it can't load. Sorted by id. */
export async function scanPersonas(root: string): Promise<PersonaScanEntry[]> {
  const dir = join(resolve(root), "personas")
  return Promise.all(
    (await manifestNames(dir)).map(async name => {
      try {
        const persona = parsePersonaManifest(await readManifestText(dir, name), name)
        return { name, label: persona.label, when: persona.when }
      } catch (error) {
        return { name, error: error instanceof Error ? error.message : String(error) }
      }
    })
  )
}

/** A whole skill as text, for storing it somewhere without a disk (the cloud's `ability` table). */
export type SkillBundle = {
  name: string
  description: string
  /** Relative path → text, SKILL.md included; binary, hidden and oversized files are left out. */
  files: Record<string, string>
  /** Has a scripts/ folder: it needs a shell, so hosts without one (the cloud) shouldn't offer it. */
  hasScripts: boolean
}

/** Reads `<root>/skills/<name>/` into a {@link SkillBundle}. Throws when SKILL.md is missing or invalid. */
export async function readSkillBundle(root: string, name: string): Promise<SkillBundle> {
  const { summary } = await readSkillFolder(join(resolve(root), "skills"), name)
  const dir = summary.dir!
  const files: Record<string, string> = { [SKILL_FILE]: await readFile(join(dir, SKILL_FILE), "utf8") }
  for (const path of summary.files) {
    const bytes = await readFile(join(dir, path)).catch(() => undefined)
    if (bytes && bytes.byteLength <= MAX_FILE_BYTES && !bytes.includes(0)) files[path] = bytes.toString("utf8")
  }
  return {
    name,
    description: summary.description,
    files,
    hasScripts: summary.files.some(path => path.startsWith("scripts/"))
  }
}

/** {@link AbilityStore} over a marketplace folder on disk — the CLI's store. */
export function createFolderAbilityStore(opts: FolderAbilityStoreOptions): AbilityStore {
  const skillsRoot = join(resolve(opts.root), "skills")
  const enabled = new Set(opts.enabled.skills)

  return {
    async listSkills() {
      const skills: SkillSummary[] = []
      for (const name of enabled) {
        try {
          skills.push((await readSkillFolder(skillsRoot, name)).summary)
        } catch (error) {
          warn("Skipping enabled skill", { skill: name, error: error instanceof Error ? error.message : error })
        }
      }
      return skills
    },

    listHttpTools: () =>
      readEnabled(
        opts.enabled.tools,
        name => readManifest(join(resolve(opts.root), "tools"), name, HttpToolAbilitySchema),
        "HTTP tool ability"
      ),

    listMcpAbilities: () =>
      readEnabled(
        opts.enabled.mcp,
        name => readManifest(join(resolve(opts.root), "mcp"), name, McpAbilitySchema),
        "MCP ability"
      ),

    async readSkill(name, file) {
      if (!enabled.has(name) || !SkillNameSchema.safeParse(name).success) return undefined
      if (file !== undefined) return readConfinedFile(join(skillsRoot, name), file)
      try {
        return (await readSkillFolder(skillsRoot, name)).body
      } catch {
        return undefined
      }
    }
  }
}
