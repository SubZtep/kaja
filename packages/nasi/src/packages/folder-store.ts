import { readdir, readFile, realpath, stat } from "node:fs/promises"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import { warn } from "@kaja/logger"
import { SkillNameSchema } from "@kaja/schema/packages"
import { parseSkillMd } from "./skill-md"
import { type PackageStore, SkillFileError, type SkillSummary } from "./types"

const SKILL_FILE = "SKILL.md"
const MAX_LISTED_FILES = 200
const MAX_FILE_BYTES = 256 * 1024
// Dotfiles and the .bak/.bak2 backups a marketplace sync leaves behind never reach the model.
const HIDDEN = /^\.|\.bak\d*$/

export type FolderPackageStoreOptions = {
  /** The marketplace folder; skills live in `<root>/skills/<name>/`. */
  root: string
  /** Package names the host enabled (packages.toml) — only these load. */
  enabled: { skills: string[] }
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

/** {@link PackageStore} over a marketplace folder on disk — the CLI's store. */
export function createFolderPackageStore(opts: FolderPackageStoreOptions): PackageStore {
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
