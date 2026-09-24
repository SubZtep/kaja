import { expect, test } from "bun:test"
import { AUTH_MESSAGES } from "@kaja/schema/api"
import { m } from "../paraglide/messages.js"
import { authErrorMessage, VALIDATION, validationMessage } from "./error-messages"

test("every schema validation message has a translation", () => {
  for (const message of Object.values(AUTH_MESSAGES)) expect(VALIDATION[message]).toBeFunction()
  expect(validationMessage(AUTH_MESSAGES.passwordUppercase)).toBe(m.validation_password_uppercase())
})

test("a validation message the web doesn't know stays as it is", () => {
  expect(validationMessage("Something custom")).toBe("Something custom")
  expect(validationMessage(undefined)).toBe(m.error_generic())
})

test("a known Better Auth code or a rate limit gets its translation", () => {
  expect(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" })).toBe(
    m.auth_error_invalid_credentials()
  )
  expect(authErrorMessage({ status: 429, statusText: "Too Many Requests" })).toBe(m.auth_error_rate_limited())
})

test("an unknown Better Auth error keeps its own message rather than nothing", () => {
  expect(authErrorMessage({ code: "SOMETHING_NEW", message: "Something new" })).toBe("Something new")
  expect(authErrorMessage({})).toBe(m.error_generic())
})
