// Runs Biome or Tombi from this machine (neither is a dependency), or says how to install it; `--pinned` prints the version the repo expects instead.
// Usage: bun scripts/tool.ts <biome|tombi> <args> | bun scripts/tool.ts <biome|tombi> --pinned

import { TOOLS, type ToolName, toolPath } from "./lib/tools"

const [name, ...args] = Bun.argv.slice(2)
if (!name || !(name in TOOLS)) {
  console.error(`Usage: bun scripts/tool.ts <${Object.keys(TOOLS).join("|")}> <args>`)
  process.exit(1)
}
const tool = name as ToolName

if (args[0] === "--pinned") {
  console.log(await TOOLS[tool].pinned())
  process.exit(0)
}

let path: string
try {
  path = await toolPath(tool)
} catch (error) {
  console.error((error as Error).message)
  process.exit(1)
}
const child = Bun.spawn([path, ...args], { stdio: ["inherit", "inherit", "inherit"] })
process.exit(await child.exited)
