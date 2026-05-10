import { describe, expect, it } from "bun:test"
import { DEFAULT_API_URL, normalizeConfig, pickApiUrl } from "./config"

describe("pickApiUrl", () => {
  it("prefers argv over env and config", () => {
    const resolved = pickApiUrl({
      argApiUrl: "https://arg.local",
      envApiUrl: "https://env.local",
      configApiUrl: "https://config.local"
    })

    expect(resolved).toBe("https://arg.local")
  })

  it("falls back to default", () => {
    expect(pickApiUrl({})).toBe(DEFAULT_API_URL)
  })
})

describe("normalizeConfig", () => {
  it("returns defaults on invalid config", () => {
    expect(normalizeConfig({ version: 99 })).toEqual({ version: 1 })
  })

  it("drops empty ollama config entries", () => {
    const normalized = normalizeConfig({
      version: 1,
      ollama: { host: "   ", model: "" }
    })

    expect(normalized).toEqual({ version: 1, ollama: undefined })
  })
})
