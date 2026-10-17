import { readdirSync } from "node:fs"
import { basename, join } from "node:path"
import { e2eDir } from "./env"
import { startModel } from "./llama"
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

const scenarios = await Promise.all(
  files.map(async file => ({
    file,
    scenario: ((await import(join(scenariosDir, `${file}${suffix}`))) as { default: Scenario }).default
  }))
)

const llama = scenarios.some(({ scenario }) => scenario.llm) ? await startModel() : undefined
console.log("Starting the stack (fresh database, API, web)...")
const stack = await startStack(llama)
const browser = await launchBrowser()
const results: Result[] = []

try {
  for (const { file, scenario } of scenarios) {
    console.log(`\n▶ ${scenario.name}`)
    const result = await runScenario(browser, stack, scenario, file)
    results.push(result)
    console.log(result.ok ? `  ✓ ${result.seconds.toFixed(1)} s` : `  ✗ [${result.kind}] ${result.error}`)
  }
} finally {
  await browser.close()
  await stack.stop()
  await llama?.stop()
}

console.log("")
for (const result of results)
  console.log(`${result.ok ? "✓" : `✗ [${result.kind}]`} ${result.name}${result.video ? `  ${result.video}` : ""}`)
process.exit(results.every(result => result.ok) ? 0 : 1)
