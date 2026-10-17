import { readdirSync } from "node:fs"
import { basename, join } from "node:path"
import { e2eDir } from "./env"
import { launchBrowser, type Result, runScenario } from "./runner"
import type { Scenario } from "./scenario"
import { startStack } from "./stack"

const suffix = ".scenario.ts"
const scenariosDir = join(e2eDir, "scenarios")
const wanted = process.argv.slice(2)

const files = readdirSync(scenariosDir)
  .filter(name => name.endsWith(suffix))
  .map(name => basename(name, suffix))
  .filter(name => wanted.length === 0 || wanted.includes(name))
  .sort()

if (files.length === 0) {
  console.error(`No scenario matches ${wanted.join(", ") || "(none found)"} in ${scenariosDir}`)
  process.exit(1)
}

console.log("Starting the stack (fresh database, API, web)...")
const stack = await startStack()
const browser = await launchBrowser()
const results: Result[] = []

try {
  for (const file of files) {
    const { default: scenario } = (await import(join(scenariosDir, `${file}${suffix}`))) as { default: Scenario }
    console.log(`\n▶ ${scenario.name}`)
    const result = await runScenario(browser, stack, scenario, file)
    results.push(result)
    console.log(result.ok ? `  ✓ ${result.seconds.toFixed(1)} s` : `  ✗ ${result.error}`)
  }
} finally {
  await browser.close()
  await stack.stop()
}

console.log("")
for (const result of results)
  console.log(`${result.ok ? "✓" : "✗"} ${result.name}${result.video ? `  ${result.video}` : ""}`)
process.exit(results.every(result => result.ok) ? 0 : 1)
