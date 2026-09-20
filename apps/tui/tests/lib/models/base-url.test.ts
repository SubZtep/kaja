import { expect, test } from "bun:test"
import { setModelFields, setProviderBaseUrl } from "../../../lib/models/models"

const TEMPLATE = `# Kaja models — a comment that must survive.

[providers.ollama]
base_url = "http://localhost:11434/v1"

[providers.speaches]
base_url = "http://localhost:8000"  # local server, no key needed

[models.chat]
model = "llama3.2:1b"
task = "chat"
provider = "ollama"
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

[models.chat]
model = "accounts/fireworks/models/minimax-m3"  # the default
task = "chat"
provider = "fireworks"

[models.ollama-chat]
model = "llama3.2:1b"
task = "chat"
provider = "ollama"
`

test("setModelFields points a task's default at another provider and model, keeping its id", () => {
  const out = setModelFields(TWO_CHATS, "chat", "ollama", "llama3.2:1b")
  expect(out).toContain('[models.chat]\nmodel = "llama3.2:1b"  # the default\ntask = "chat"\nprovider = "ollama"')
  // The id is unchanged, and the alternative entry and the comments are untouched.
  expect(out).toContain('[models.ollama-chat]\nmodel = "llama3.2:1b"\ntask = "chat"\nprovider = "ollama"')
  expect(out).toContain("# Kaja models — a comment that must survive.")
  expect(out).toContain('[providers.fireworks]\nbase_url = "https://api.fireworks.ai/inference/v1"')
})

test("setModelFields leaves the text alone when the task has no default entry", () => {
  expect(setModelFields(TWO_CHATS, "embedding", "ollama", "nomic-embed-text")).toBe(TWO_CHATS)
})

test("setModelFields escapes a value that would break out of the string", () => {
  expect(setModelFields(TWO_CHATS, "chat", "ollama", 'we"ird')).toContain('model = "we\\"ird"  # the default')
})
