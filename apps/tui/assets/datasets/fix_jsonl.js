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
  // remove a single leading comma if present
  if (line.startsWith(",")) line = line.replace(/^,\s*/, "")
  // remove a single trailing comma if present
  if (line.endsWith(",")) line = line.replace(/,\s*$/, "")
  // ignore lines that are not full JSON objects
  if (!line.startsWith("{") || !line.endsWith("}")) {
    // skip malformed/broken lines
    continue
  }
  out.push(line)
}

fs.writeFileSync(outPath, `${out.join("\n")}\n`)
console.log("Wrote", out.length, "JSON objects to", outPath)
