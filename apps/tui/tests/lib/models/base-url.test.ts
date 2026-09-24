import { expect, test } from "bun:test"
import { setProviderBaseUrl, setTaskModel } from "../../../lib/models/models"

const TEMPLATE = `# Kaja models — a comment that must survive.

[providers.ollama]
base_url = "http://localhost:11434/v1"

[providers.speaches]
base_url = "http://localhost:8000"  # local server, no key needed

[tasks]
chat = "llama3-2-1b"

[models.llama3-2-1b]
model = "llama3.2:1b"
provider = "ollama"
tasks = ["chat"]
`

test("repoints the named provider and leaves everything else alone", () => {
  const out = setProviderBaseUrl(TEMPLATE, "ollama", "http://box.local:9090/v1")
  expect(out).toContain('[providers.ollama]\nbase_url = "http://box.local:9090/v1"')
  // The other provider, the trailing comment and the header comment are untouched.
  expect(out).toContain('base_url = "http://localhost:8000"  # local server, no key needed')
  expect(out).toContain("# Kaja models — a comment that must survive.")
  expect(out).toContain('model = "llama3.2:1b"')
})

test("does not reach past its own table into the next provider", () => {
  // speaches has no base_url of its own in this input, so nothing may be rewritten.
  const withoutUrl = '[providers.bare]\n\n[providers.ollama]\nbase_url = "http://localhost:11434/v1"\n'
  expect(setProviderBaseUrl(withoutUrl, "bare", "http://nope/v1")).toBe(withoutUrl)
})

test("leaves the text unchanged when the provider is absent", () => {
  expect(setProviderBaseUrl(TEMPLATE, "fireworks", "http://x/v1")).toBe(TEMPLATE)
})

test("escapes a value that would otherwise break out of the string", () => {
  const out = setProviderBaseUrl(TEMPLATE, "ollama", 'http://x/"evil')
  expect(out).toContain('base_url = "http://x/\\"evil"')
})

const TWO_CHATS = `# Kaja models — a comment that must survive.

[providers.fireworks]
base_url = "https://api.fireworks.ai/inference/v1"

[providers.ollama]
base_url = "http://localhost:11434/v1"

[tasks]
chat = "minimax-m3"  # the default
embedding = "qwen3-embedding-8b"

[models.minimax-m3]
model = "accounts/fireworks/models/minimax-m3"
provider = "fireworks"
tasks = ["chat"]

[models.llama3-2-1b]
model = "llama3.2:1b"
provider = "ollama"
tasks = ["chat"]
`

test("setTaskModel points a task at another model id and touches nothing else", () => {
  const out = setTaskModel(TWO_CHATS, "chat", "llama3-2-1b")
  expect(out).toBe(TWO_CHATS.replace('chat = "minimax-m3"', 'chat = "llama3-2-1b"'))
})

test("setTaskModel adds a task [tasks] doesn't have yet, inside the table", () => {
  const out = setTaskModel(TWO_CHATS, "summarize", "llama3-2-1b")
  expect(out).toContain('embedding = "qwen3-embedding-8b"\nsummarize = "llama3-2-1b"\n\n[models.minimax-m3]')
})

test("setTaskModel leaves the text alone when there is no [tasks] table", () => {
  const text = TWO_CHATS.replace("[tasks]", "[other]")
  expect(setTaskModel(text, "chat", "llama3-2-1b")).toBe(text)
})

test("setTaskModel escapes an id that would break out of the string", () => {
  expect(setTaskModel(TWO_CHATS, "chat", 'we"ird')).toContain('chat = "we\\"ird"  # the default')
})
