import { expect, test } from "bun:test"
import { setProviderBaseUrl } from "../../../lib/models/models"

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
