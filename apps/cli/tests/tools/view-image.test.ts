import { expect, test } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// tools/view-image.ts pulls in lib/agents.ts -> lib/openai.ts, which reads
// config() at module load — config() hard-exits the process if settings.json
// is missing or its chat model doesn't resolve in models.toml, so this
// isolated config dir needs both (same fixture as tests/lib/agents.test.ts).
const configDir = `${tmpdir()}/kaja-test-xdg-config-view-image`
process.env.XDG_CONFIG_HOME = configDir
const configKajaDir = join(configDir, "kaja")
mkdirSync(configKajaDir, { recursive: true })
writeFileSync(
  join(configKajaDir, "settings.json"),
  JSON.stringify({
    models: { chat: { model: "x", provider: "default" } }
  })
)
writeFileSync(
  join(configKajaDir, "models.toml"),
  `
[providers.default]
base_url = "http://localhost"
api_key = "x"

[[models]]
id = "chat-default"
model = "x"
task = "chat"
`
)

const { viewImageTool } = await import("../../tools/view-image")

test("view_image returns the path and mimeType for an existing image", async () => {
  const path = join(tmpdir(), "kaja-test-view-image.png")
  await Bun.write(path, new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
  const result = await viewImageTool.execute({ path })
  expect(result).toEqual({
    text: `Viewing image: ${path}`,
    images: [{ path, mimeType: "image/png" }]
  })
})

test("view_image reports a missing file", async () => {
  const result = await viewImageTool.execute({ path: "/no/such/file.png" })
  expect(result).toBe("File not found: /no/such/file.png")
})
