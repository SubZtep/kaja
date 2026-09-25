import { expect, test } from "bun:test"
import { signSandboxToken, verifySandboxToken } from "../sandbox-token"

const SECRET = "test-secret"
const claims = { sub: "user-1", ability: "chrome-devtools", exp: Math.floor(Date.now() / 1000) + 60 }

test("a signed token verifies back to its claims", async () => {
  expect(await verifySandboxToken(await signSandboxToken(claims, SECRET), SECRET)).toEqual(claims)
})

test("another secret, a tampered payload or a malformed token doesn't verify", async () => {
  const token = await signSandboxToken(claims, SECRET)
  expect(await verifySandboxToken(token, "other-secret")).toBeUndefined()
  const [, signature] = token.split(".")
  const forged = btoa(JSON.stringify({ ...claims, sub: "user-2" })).replace(/=+$/, "")
  expect(await verifySandboxToken(`${forged}.${signature}`, SECRET)).toBeUndefined()
  expect(await verifySandboxToken("nonsense", SECRET)).toBeUndefined()
  expect(await verifySandboxToken(`${token}.more`, SECRET)).toBeUndefined()
})

test("an expired token doesn't verify", async () => {
  const token = await signSandboxToken(claims, SECRET)
  expect(await verifySandboxToken(token, SECRET, (claims.exp + 1) * 1000)).toBeUndefined()
})
