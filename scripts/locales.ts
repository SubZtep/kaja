import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { $ } from "bun"

// Syncs every non-en-GB locale file to en-GB: same keys in the same order; a key that is new or whose English changed since HEAD gets a lorem ipsum placeholder tagged with the language code, unless that translation was itself edited in the working tree. `--stage` git-adds the files it rewrote; `--check` fails on drift or leftover placeholders; `--todo` lists the placeholders as JSON and `--apply <file>` writes their translations back (the /translate skill).

const LOCALE_DIRS = ["apps/tui/locales", "apps/api/locales", "apps/api/widgets/locales", "apps/web/messages"]
const SOURCE = "en-GB"
const LOREM =
  "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat".split(
    " "
  )

type Values = Map<string, string>

// A key's raw value span in a TOML file, so rewriting keeps each file's own quoting and multiline layout
type Span = { key: string; start: number; end: number }

const headRef = (path: string) => $`git show HEAD:${path}`.quiet().nothrow()

/** Text of `path` at HEAD, or undefined when it isn't committed yet. */
async function readHead(path: string): Promise<string | undefined> {
  const out = await headRef(path)
  return out.exitCode === 0 ? out.stdout.toString() : undefined
}

function multilineEnd(text: string, start: number, fence: string): number {
  let i = start + 3
  for (;;) {
    const at = text.indexOf(fence, i)
    if (at < 0) throw new Error(`Unterminated ${fence} string at ${start}`)
    let slashes = 0
    while (fence === '"""' && text[at - 1 - slashes] === "\\") slashes++
    if (slashes % 2 === 0) {
      // Up to two quotes may sit right before the closing fence
      let end = at + 3
      while (text[end] === fence[0] && end - at < 5) end++
      return end
    }
    i = at + 1
  }
}

function basicEnd(text: string, start: number): number {
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") i++
    else if (text[i] === '"') return i + 1
  }
  throw new Error(`Unterminated string at ${start}`)
}

function valueEnd(text: string, start: number): number {
  const fence = ['"""', "'''"].find(f => text.startsWith(f, start))
  if (fence) return multilineEnd(text, start, fence)
  if (text[start] === '"') return basicEnd(text, start)
  if (text[start] === "'") return text.indexOf("'", start + 1) + 1
  const eol = text.indexOf("\n", start)
  return eol < 0 ? text.length : eol
}

function scanToml(text: string): Span[] {
  const spans: Span[] = []
  let section = ""
  let i = 0
  while (i < text.length) {
    const eol = text.indexOf("\n", i)
    const line = text.slice(i, eol < 0 ? text.length : eol)
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line)
    const kv = /^\s*([A-Za-z0-9_-]+)\s*=\s*/.exec(line)
    let next = eol < 0 ? text.length : eol + 1
    if (header) section = `${header[1]?.trim()}.`
    else if (kv) {
      const start = i + kv[0].length
      const end = valueEnd(text, start)
      spans.push({ key: section + kv[1], start, end })
      const after = text.indexOf("\n", end)
      next = after < 0 ? text.length : after + 1
    }
    i = next
  }
  return spans
}

function tomlValues(text: string): Values {
  const parsed = Bun.TOML.parse(text) as Record<string, unknown>
  const values: Values = new Map()
  for (const { key } of scanToml(text)) {
    let node: unknown = parsed
    for (const part of key.split(".")) node = (node as Record<string, unknown>)[part]
    values.set(key, String(node))
  }
  return values
}

const jsonValues = (text: string): Values =>
  new Map(Object.entries(JSON.parse(text) as Record<string, string>).map(([k, v]) => [k, String(v)]))

const valuesOf = (text: string, json: boolean) => (json ? jsonValues(text) : tomlValues(text))

function loremLine(line: string, locale: string): string {
  if (!line.trim()) return line
  const params = line.match(/\{[^{}]+\}/g) ?? []
  const target = Math.max(line.replace(/\{[^{}]+\}/g, "").length, 1)
  const indent = /^\s*/.exec(line)?.[0] ?? ""
  const words = [`[${locale}]`]
  for (let w = 0; w === 0 || indent.length + words.join(" ").length < target; w++) {
    words.push(LOREM[w % LOREM.length] as string)
  }
  return indent + [...words, ...params].join(" ")
}

/** Placeholder with the English's line structure, rough length and `{params}`. */
const lorem = (english: string, locale: string) =>
  english
    .split("\n")
    .map(line => loremLine(line, locale))
    .join("\n")

const ESCAPED_BACKSLASH = String.raw`\\`
const ESCAPED_FENCE = String.raw`""\"`

function tomlString(value: string): string {
  if (!value.includes("\n")) return JSON.stringify(value)
  const body = value.replaceAll("\\", ESCAPED_BACKSLASH).replaceAll('"""', ESCAPED_FENCE)
  return `"""\n${body}"""`
}

type Locales = { json: boolean; sourcePath: string; targets: { locale: string; path: string }[] }

const byName = (a: string, b: string) => a.localeCompare(b)

/** A locale dir's en-GB file and the other languages' files. */
async function localesOf(dir: string): Promise<Locales> {
  const files = (await readdir(dir)).filter(f => /\.(toml|json)$/.test(f)).sort(byName)
  const source = files.find(f => f.startsWith(`${SOURCE}.`))
  if (!source) throw new Error(`No ${SOURCE} file in ${dir}`)
  const ext = source.slice(source.lastIndexOf("."))
  const targets = files
    .filter(f => f !== source && f.endsWith(ext))
    .map(f => ({ locale: f.slice(0, -ext.length), path: join(dir, f) }))
  return { json: ext === ".json", sourcePath: join(dir, source), targets }
}

type Keep = (key: string) => boolean

function syncJson(english: Values, current: Values, keep: Keep, locale: string): string {
  const out: Record<string, string> = {}
  for (const [key, value] of english) {
    if (key.startsWith("$")) out[key] = value
    else out[key] = keep(key) ? (current.get(key) as string) : lorem(value, locale)
  }
  return `${JSON.stringify(out, null, 2)}\n`
}

// Rewrites en-GB's text with each value swapped for the target's raw value (or a placeholder), so layout follows en-GB
function syncToml(sourceText: string, text: string, english: Values, keep: Keep, locale: string): string {
  const raw = new Map(scanToml(text).map(s => [s.key, text.slice(s.start, s.end)]))
  let next = sourceText
  for (const span of scanToml(sourceText).reverse()) {
    const value = keep(span.key)
      ? (raw.get(span.key) as string)
      : tomlString(lorem(english.get(span.key) as string, locale))
    next = next.slice(0, span.start) + value + next.slice(span.end)
  }
  return next
}

async function syncDir(dir: string, write = true): Promise<string[]> {
  const { json, sourcePath, targets } = await localesOf(dir)
  const sourceText = await Bun.file(sourcePath).text()
  const english = valuesOf(sourceText, json)
  const englishHeadText = await readHead(sourcePath)
  const englishHead = englishHeadText === undefined ? undefined : valuesOf(englishHeadText, json)
  const changed = (key: string) => englishHead !== undefined && englishHead.get(key) !== english.get(key)

  const written: string[] = []
  for (const { locale, path } of targets) {
    const text = await Bun.file(path).text()
    const current = valuesOf(text, json)
    const headText = await readHead(path)
    const head = headText === undefined ? new Map<string, string>() : valuesOf(headText, json)
    // Keep a translation unless its English is new or changed and nobody touched the translation in this change
    const keep = (key: string) => current.has(key) && (!changed(key) || current.get(key) !== head.get(key))
    const next = json ? syncJson(english, current, keep, locale) : syncToml(sourceText, text, english, keep, locale)
    if (next === text) continue
    if (write) await Bun.write(path, next)
    written.push(path)
  }
  return written
}

const isPlaceholder = (value: string, locale: string) => value.trimStart().startsWith(`[${locale}] lorem`)
const paramsOf = (value: string) => [...(value.match(/\{[^{}]+\}/g) ?? [])].sort(byName).join(" ")

type Nearby = { key: string; english: string; translation: string }
type Todo = { file: string; key: string; english: string; nearby: Nearby[] }
type Translation = Omit<Todo, "nearby"> & { value: string }

const NEARBY = 6
// TOML keys group by section, web keys by their first word (`nav_home`, `nav_docs`)
const groupOf = (key: string) => key.split(/[._]/)[0]

/** Up to NEARBY translated keys of the same group, closest in file order first, to match terminology and tone. */
function nearby(key: string, english: Values, values: Values, locale: string): Nearby[] {
  const keys = [...values.keys()]
  const at = keys.indexOf(key)
  return keys
    .map((k, i) => ({ k, distance: Math.abs(i - at) }))
    .filter(({ k }) => k !== key && !k.startsWith("$") && groupOf(k) === groupOf(key))
    .filter(({ k }) => !isPlaceholder(values.get(k) as string, locale))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, NEARBY)
    .map(({ k }) => ({ key: k, english: english.get(k) ?? "", translation: values.get(k) as string }))
}

/** Every placeholder still waiting for a translation, with its English and nearby translated keys. */
async function todo(): Promise<Todo[]> {
  const todos: Todo[] = []
  for (const dir of LOCALE_DIRS) {
    const { json, sourcePath, targets } = await localesOf(dir)
    const english = valuesOf(await Bun.file(sourcePath).text(), json)
    for (const { locale, path } of targets) {
      const values = valuesOf(await Bun.file(path).text(), json)
      for (const [key, value] of values) {
        if (!isPlaceholder(value, locale)) continue
        todos.push({ file: path, key, english: english.get(key) ?? "", nearby: nearby(key, english, values, locale) })
      }
    }
  }
  return todos
}

// The entries whose key exists in en-GB with the same `{params}`; the rest go to `errors`
function validEntries(file: string, entries: Translation[], english: Values, errors: string[]): Translation[] {
  return entries.filter(({ key, value }) => {
    const source = english.get(key)
    if (source === undefined) errors.push(`${file} ${key}: no such key in ${SOURCE}`)
    else if (paramsOf(source) !== paramsOf(value)) errors.push(`${file} ${key}: params differ from ${SOURCE}`)
    return source !== undefined && paramsOf(source) === paramsOf(value)
  })
}

function withTranslations(text: string, json: boolean, entries: Translation[]): string {
  const values = new Map(entries.map(t => [t.key, t.value]))
  if (json) {
    const out = JSON.parse(text) as Record<string, string>
    for (const [key, value] of values) out[key] = value
    return `${JSON.stringify(out, null, 2)}\n`
  }
  let next = text
  for (const span of scanToml(text).reverse()) {
    const value = values.get(span.key)
    if (value !== undefined) next = next.slice(0, span.start) + tomlString(value) + next.slice(span.end)
  }
  return next
}

/** Writes `value`s from a `--todo`-shaped JSON file (each entry plus `value`) into the non-en-GB files. */
async function apply(input: string): Promise<void> {
  const translations = (await Bun.file(input).json()) as Translation[]
  const errors: string[] = []
  for (const [file, entries] of Map.groupBy(translations, t => t.file)) {
    const dir = LOCALE_DIRS.find(d => file.startsWith(`${d}/`))
    if (!dir || file.includes(`/${SOURCE}.`)) {
      errors.push(`${file}: not a translation file`)
      continue
    }
    const { json, sourcePath } = await localesOf(dir)
    const ok = validEntries(file, entries, valuesOf(await Bun.file(sourcePath).text(), json), errors)
    await Bun.write(file, withTranslations(await Bun.file(file).text(), json, ok))
    console.log(`translated ${ok.length} in ${file}`)
  }
  if (errors.length > 0) {
    console.error(errors.join("\n"))
    process.exit(1)
  }
}

/** Exits 1 when a language is out of step with en-GB or still has placeholders (pre-push on main, CI). */
async function check(): Promise<void> {
  const drifted = (await Promise.all(LOCALE_DIRS.map(dir => syncDir(dir, false)))).flat()
  const untranslated = Map.groupBy(await todo(), t => t.file)
  if (drifted.length === 0 && untranslated.size === 0) return
  for (const path of drifted) console.error(`out of sync with ${SOURCE}: ${path}`)
  for (const [file, entries] of untranslated)
    console.error(`untranslated: ${file} (${entries.map(e => e.key).join(", ")})`)
  if (drifted.length > 0) console.error("\nRun `bun sync:locales` to bring the keys in line with en-GB.")
  console.error(
    "Then run /translate in Claude Code (or translate the [<locale>] lorem placeholders by hand) and commit."
  )
  process.exit(1)
}

const args = process.argv.slice(2)
if (args[0] === "--todo") console.log(JSON.stringify(await todo(), null, 2))
else if (args[0] === "--apply" && args[1]) await apply(args[1])
else if (args[0] === "--check") await check()
else {
  const written = (await Promise.all(LOCALE_DIRS.map(dir => syncDir(dir)))).flat()
  for (const path of written) console.log(`synced ${path}`)
  if (args.includes("--stage") && written.length > 0) await $`git add ${written}`
}
