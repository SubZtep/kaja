const fs = require("node:fs")
const path = require("node:path")

const inPath = path.join(__dirname, "..", "assets", "dataset", "data.jsonl")
const outPath = path.join(__dirname, "..", "assets", "dataset", "data_fixed.jsonl")

const data = fs.readFileSync(inPath, "utf8")
const lines = data.split(/\r?\n/)
const out = []

for (const raw of lines) {
  let line = raw.trim()
  if (line === "") continue
  if (line.startsWith(",")) line = line.replace(/^,\s*/, "")
  if (line.endsWith(",")) line = line.replace(/,\s*$/, "")
  if (!line.startsWith("{") || !line.endsWith("}")) continue
  out.push(line)
}

fs.writeFileSync(outPath, `${out.join("\n")}\n`)
console.log("Wrote", out.length, "JSON objects to", outPath)
