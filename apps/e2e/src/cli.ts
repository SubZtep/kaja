import { readdirSync } from "node:fs"
import { basename, join } from "node:path"
import { e2eDir } from "./env"
import { startModel } from "./llama"
import { launchBrowser, type Result, runScenario } from "./runner"
import { startSandbox } from "./sandbox"
import type { Scenario } from "./scenario"
import { startStack } from "./stack"
import { stitch } from "./stitch"

function mark(result: Result): string {
  if (result.skipped) return "–"
  return result.ok ? "✓" : `✗ [${result.kind}]`
}

function outcome(result: Result): string {
  if (result.skipped) return `– skipped: ${result.skipped}`
  if (result.ok) return `✓ ${result.seconds.toFixed(1)} s`
  return `✗ [${result.kind}] ${result.error}`
}

const suffix = ".scenario.ts"
const scenariosDir = join(e2eDir, "scenarios")
const flags = process.argv.slice(2).filter(arg => arg.startsWith("--"))
const wanted = process.argv.slice(2).filter(arg => !arg.startsWith("--"))

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
const sandbox = scenarios.some(({ scenario }) => scenario.sandbox) ? await startSandbox(stack) : undefined
const browser = await launchBrowser()
const results: Result[] = []

try {
  for (const { file, scenario } of scenarios) {
    console.log(`\n▶ ${scenario.name}`)
    const result = await runScenario(browser, stack, scenario, file)
    results.push(result)
    console.log(`  ${outcome(result)}`)
  }
  if (!flags.includes("--no-video")) {
    console.log("\nStitching the clips into one video...")
    try {
      console.log(`Full run: ${await stitch(browser, results)}`)
    } catch (error) {
      console.error(`Stitching failed: ${(error as Error).message}`)
    }
  }
} finally {
  await browser.close()
  await sandbox?.stop()
  await stack.stop()
  await llama?.stop()
}

console.log("")
for (const result of results) {
  const clips = result.videos.length ? `  ${result.videos.join("  ")}` : ""
  console.log(`${mark(result)} ${result.name}${clips}`)
}
process.exit(results.every(result => result.ok) ? 0 : 1)
