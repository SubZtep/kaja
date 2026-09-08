#!/usr/bin/env node
const fs = require("node:fs").promises
const path = require("node:path")

const DATA_DIR = path.join(__dirname, "..", "assets", "dataset")
const OUT_PATH = process.argv[2] || path.join(DATA_DIR, "combined_dataset.jsonl")

async function listFiles(dir) {
  const files = await fs.readdir(dir)
  return files.map(f => path.join(dir, f))
}

function safeJSONParse(s) {
  try {
    return JSON.parse(s)
  } catch (_e) {
    return null
  }
}

function normalizeExample(obj) {
  // Ensure final format:
  // { input: { messages: [{role,content}, ...] }, preferred_output: [{role,content}], non_preferred_output: [{role,content}] }
  const out = { input: { messages: [] }, preferred_output: [], non_preferred_output: [] }

  if (!obj) return null

  if (obj.input && Array.isArray(obj.input.messages)) {
    out.input.messages = obj.input.messages.map(m => ({ role: m.role || "user", content: String(m.content || "") }))
  }

  // If top-level messages present
  else if (Array.isArray(obj.messages)) {
    out.input.messages = obj.messages.map(m => ({ role: m.role || "user", content: String(m.content || "") }))
  }

  // simple user/assistant pair
  else {
    const user = obj.user || obj.prompt || obj.input || obj.question || obj.query
    const assistant = obj.assistant || obj.output || obj.completion || obj.response || obj.answer
    if (user) out.input.messages.push({ role: "user", content: String(user) })
    if (!assistant && obj.text && typeof obj.text === "string") {
      // maybe whole text, treat as user
      if (!user) out.input.messages.push({ role: "user", content: obj.text })
    }
    if (assistant) out.preferred_output.push({ role: "assistant", content: String(assistant) })
  }

  // If we haven't filled preferred_output but there is an 'response' field or 'outputs' array
  if (out.preferred_output.length === 0) {
    if (obj.preferred_output) {
      const po = Array.isArray(obj.preferred_output) ? obj.preferred_output : [obj.preferred_output]
      po.forEach(p => out.preferred_output.push({ role: "assistant", content: String(p?.content || p) }))
    } else if (obj.output) {
      out.preferred_output.push({ role: "assistant", content: String(obj.output) })
    }
  }

  // If still empty, and last message in input is assistant, promote it
  if (out.preferred_output.length === 0 && out.input.messages.length) {
    const last = out.input.messages[out.input.messages.length - 1]
    if (last.role === "assistant") {
      out.preferred_output.push({ role: "assistant", content: last.content })
      out.input.messages = out.input.messages.slice(0, -1)
    }
  }

  // Always ensure at least one user message
  if (out.input.messages.length === 0) return null
  if (out.preferred_output.length === 0) out.preferred_output.push({ role: "assistant", content: "" })

  return out
}

function parseTxtEntries(text) {
  // Split on 2+ newlines into entries
  const raw = text
    .split(/\n{2,}/)
    .map(s => s.trim())
    .filter(Boolean)
  const examples = []
  for (const entry of raw) {
    // If entry contains 'Assistant:' or 'User:' labels
    if (/\bUser:|\bAssistant:|\bResponse:|\bAssistant\b/i.test(entry)) {
      const lines = entry.split(/\n/)
      const userParts = []
      const assistantParts = []
      let mode = "user"
      for (const ln of lines) {
        const mUser = ln.match(/^\s*(?:User:|USER:|user:)\s*(.*)$/)
        const mAssistant = ln.match(/^\s*(?:Assistant:|ASSISTANT:|assistant:|Response:)\s*(.*)$/)
        if (mUser) {
          mode = "user"
          userParts.push(mUser[1] || "")
          continue
        }
        if (mAssistant) {
          mode = "assistant"
          assistantParts.push(mAssistant[1] || "")
          continue
        }
        if (mode === "user") userParts.push(ln)
        else assistantParts.push(ln)
      }
      const user = userParts.join("\n").trim()
      const assistant = assistantParts.join("\n").trim()
      if (user) examples.push({ user, assistant })
      continue
    }

    // Otherwise try simple two-line pair
    const lines = entry
      .split(/\n/)
      .map(s => s.trim())
      .filter(Boolean)
    if (lines.length === 1) {
      examples.push({ user: lines[0], assistant: "" })
    } else {
      // pair first line user, rest assistant
      const user = lines[0]
      const assistant = lines.slice(1).join("\n")
      examples.push({ user, assistant })
    }
  }
  return examples
}

async function processFile(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const content = await fs.readFile(filePath, "utf8")
  const results = []
  if (ext === ".json") {
    const j = safeJSONParse(content)
    if (Array.isArray(j)) {
      for (const item of j) {
        const n = normalizeExample(item)
        if (n) results.push(n)
      }
    } else if (j && typeof j === "object") {
      // maybe object with items
      if (j.items && Array.isArray(j.items)) {
        for (const item of j.items) {
          const n = normalizeExample(item)
          if (n) results.push(n)
        }
      } else {
        const n = normalizeExample(j)
        if (n) results.push(n)
      }
    } else {
      // maybe jsonl
      const lines = content
        .split(/\n/)
        .map(l => l.trim())
        .filter(Boolean)
      for (const ln of lines) {
        const p = safeJSONParse(ln)
        if (p) {
          const n = normalizeExample(p)
          if (n) results.push(n)
        }
      }
    }
  } else if (ext === ".txt" || ext === ".md") {
    const parsed = parseTxtEntries(content)
    for (const p of parsed) {
      const n = normalizeExample(p)
      if (n) results.push(n)
    }
  } else {
    // try to parse as JSON then fallback to txt parsing
    const j = safeJSONParse(content)
    if (j) {
      if (Array.isArray(j))
        for (const item of j) {
          const n = normalizeExample(item)
          if (n) results.push(n)
        }
      else {
        const n = normalizeExample(j)
        if (n) results.push(n)
      }
    } else {
      const parsed = parseTxtEntries(content)
      for (const p of parsed) {
        const n = normalizeExample(p)
        if (n) results.push(n)
      }
    }
  }

  return results
}

async function main() {
  const files = await listFiles(DATA_DIR)
  const out = []
  for (const f of files) {
    const stat = await fs.stat(f)
    if (!stat.isFile()) continue
    try {
      const items = await processFile(f)
      for (const it of items) out.push(it)
      console.log(`Processed ${path.basename(f)} -> ${items.length} examples`)
    } catch (err) {
      console.error(`Skipping ${f}: ${err.message}`)
    }
  }

  // write jsonl
  const stream = out.map(o => JSON.stringify(o)).join("\n") + (out.length ? "\n" : "")
  await fs.writeFile(OUT_PATH, stream, "utf8")
  console.log(`Wrote ${out.length} examples to ${OUT_PATH}`)
}

if (require.main === module) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}

module.exports = { processFile, parseTxtEntries, normalizeExample }
