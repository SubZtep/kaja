#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
// Bundles @kaja/schema and @kaja/logger source into vendor/ so the published package
// has no unpublished workspace:* dependency, then compiles JS + .d.ts with tsc.
import { $ } from "bun"

const sdkDir = import.meta.dir.replace(/\/scripts$/, "")
const vendorRoot = join(sdkDir, "vendor")
const distDir = join(sdkDir, "dist")
const vendored = [
  { name: "schema", dir: join(sdkDir, "../schema") },
  { name: "logger", dir: join(sdkDir, "../logger") }
]

rmSync(vendorRoot, { recursive: true, force: true })
rmSync(distDir, { recursive: true, force: true })

for (const { name, dir } of vendored) {
  const target = join(vendorRoot, name)
  mkdirSync(target, { recursive: true })
  await $`cp ${dir}/*.ts ${target}/`
}

const entryPath = join(sdkDir, "index.ts")
const buildEntryPath = join(sdkDir, ".build-entry.ts")
let entrySource = readFileSync(entryPath, "utf8")
for (const { name } of vendored) {
  entrySource = entrySource.replaceAll(`"@kaja/${name}"`, `"./vendor/${name}"`)
}
writeFileSync(buildEntryPath, entrySource)

try {
  await $`bunx tsc -p ${join(sdkDir, "tsconfig.build.json")}`
  renameSync(join(distDir, ".build-entry.js"), join(distDir, "index.js"))
  renameSync(join(distDir, ".build-entry.d.ts"), join(distDir, "index.d.ts"))
} finally {
  rmSync(buildEntryPath, { force: true })
  rmSync(vendorRoot, { recursive: true, force: true })
}

if (!existsSync(join(distDir, "index.js"))) {
  throw new Error("sdk build failed: dist/index.js not produced")
}
