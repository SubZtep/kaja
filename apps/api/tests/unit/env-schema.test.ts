import { describe, expect, test } from "bun:test"
import { ApiEnvSchema, parseEnv } from "@kaja/schema/env"

const base = {
  CORS_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgres://localhost/kaja",
  BETTER_AUTH_SECRET: "a".repeat(32),
  STORAGE_BUCKET: "kaja",
  STORAGE_ACCESS_KEY_ID: "kaja",
  STORAGE_SECRET_ACCESS_KEY: "kaja-dev-storage"
}
const userSecretKey = btoa("k".repeat(32))

const problems = (env: Record<string, string>) => {
  const result = parseEnv(ApiEnvSchema, env)
  return result.success ? [] : result.error.issues.map(issue => issue.path.join("."))
}

describe("ApiEnvSchema", () => {
  test("secrets shorter than 32 characters are refused", () => {
    expect(problems({ ...base, BETTER_AUTH_SECRET: "short", SSR_SECRET: "short" })).toEqual([
      "BETTER_AUTH_SECRET",
      "SSR_SECRET"
    ])
  })

  test("outside production USER_SECRET_KEY is optional and the placeholder config token is fine", () => {
    expect(problems({ ...base, CONFIG_API_TOKEN: "kaja" })).toEqual([])
  })

  test("production needs USER_SECRET_KEY and a config token other than the placeholder", () => {
    const production = { ...base, NODE_ENV: "production" }
    expect(problems({ ...production, CONFIG_API_TOKEN: "kaja" })).toEqual(["USER_SECRET_KEY", "CONFIG_API_TOKEN"])
    expect(problems({ ...production, USER_SECRET_KEY: userSecretKey, CONFIG_API_TOKEN: "a-real-token" })).toEqual([])
  })
})
