import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { EXAMPLES, exampleToml } from "../apps/tui/lib/models/catalog"

const configDir = join(import.meta.dir, "..", "docs/config")

const targets = EXAMPLES.map(example => ({ outPath: join(configDir, example.file), text: exampleToml(example) }))

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
