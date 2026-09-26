import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { EXAMPLES, exampleToml } from "../apps/tui/lib/models/catalog"

const rootDir = join(import.meta.dir, "..")
const configDir = join(rootDir, "docs/config")

/** `text` as `tombi format` leaves it (tombi.toml's rules), so the lint never rewrites a generated file. */
async function tombiFormat(text: string): Promise<string> {
  const proc = Bun.spawn([join(rootDir, "node_modules/.bin/tombi"), "format", "-"], {
    cwd: rootDir,
    stdin: new Response(text),
    stdout: "pipe",
    stderr: "pipe"
  })
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ])
  if (code !== 0) throw new Error(`tombi format failed: ${err}`)
  return out
}

const targets = await Promise.all(
  EXAMPLES.map(async example => ({
    outPath: join(configDir, example.file),
    text: await tombiFormat(exampleToml(example))
  }))
)

if (process.argv.includes("--check")) {
  let hasDiff = false
  for (const target of targets) {
    const onDisk = await Bun.file(target.outPath)
      .text()
      .catch(() => "")
    if (target.text !== onDisk) {
      hasDiff = true
      console.error(`✗ ${target.outPath} is out of date — run \`bun generate:models\``)
    } else {
      console.log(`✓ ${target.outPath} is up to date`)
    }
  }
  const expected = new Set(EXAMPLES.map(example => example.file))
  for (const name of await readdir(configDir)) {
    if (/^models\..+\.toml$/.test(name) && !expected.has(name)) {
      hasDiff = true
      console.error(`✗ docs/config/${name} is not an example in docs/config/catalog.toml — delete it or add it there`)
    }
  }
  if (hasDiff) process.exit(1)
  console.log("model catalog and docs/config/models.*.toml are in sync")
} else {
  for (const target of targets) {
    await Bun.write(target.outPath, target.text)
    console.log(`Wrote ${target.outPath}`)
  }
}
