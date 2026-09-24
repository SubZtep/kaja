import { AUTH_MESSAGES } from "@kaja/schema/api"
import { m } from "../paraglide/messages.js"

/** Keyed by the schema's English text, which is what a failed field carries; exported for the coverage test. */
export const VALIDATION: Record<string, () => string> = {
  [AUTH_MESSAGES.passwordMin]: m.validation_password_min,
  [AUTH_MESSAGES.passwordMax]: m.validation_password_max,
  [AUTH_MESSAGES.passwordLowercase]: m.validation_password_lowercase,
  [AUTH_MESSAGES.passwordUppercase]: m.validation_password_uppercase,
  [AUTH_MESSAGES.passwordNumber]: m.validation_password_number,
  [AUTH_MESSAGES.passwordSpecial]: m.validation_password_special,
  [AUTH_MESSAGES.invalidEmail]: m.validation_invalid_email,
  [AUTH_MESSAGES.nameMin]: m.validation_name_min,
  [AUTH_MESSAGES.nameMax]: m.validation_name_max
}

/** A form validation message in the page's language; one the web has no translation for stays as it is. */
export function validationMessage(message: string | undefined): string {
  if (!message) return m.error_generic()
  return VALIDATION[message]?.() ?? message
}

// Better Auth's error codes our forms can run into; the rest are for flows Kaja doesn't use.
const AUTH_ERRORS: Record<string, () => string> = {
  INVALID_EMAIL_OR_PASSWORD: m.auth_error_invalid_credentials,
  EMAIL_NOT_VERIFIED: m.auth_error_email_not_verified,
  USER_ALREADY_EXISTS: m.auth_error_user_exists,
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: m.auth_error_user_exists,
  INVALID_EMAIL: m.validation_invalid_email,
  PASSWORD_TOO_SHORT: m.validation_password_min,
  PASSWORD_TOO_LONG: m.validation_password_max,
  INVALID_PASSWORD: m.auth_error_invalid_password,
  INVALID_TOKEN: m.auth_error_link_expired,
  TOKEN_EXPIRED: m.auth_error_link_expired,
  SESSION_EXPIRED: m.auth_error_session_expired,
  SESSION_NOT_FRESH: m.auth_error_session_expired
}

/** A Better Auth error in the page's language: a known code or a rate limit gets its translation, anything else Better Auth's own (English) message rather than nothing. */
export function authErrorMessage(error: { code?: string; message?: string; status?: number; statusText?: string }) {
  const known = error.code ? AUTH_ERRORS[error.code] : undefined
  if (known) return known()
  if (error.status === 429) return m.auth_error_rate_limited()
  return error.message || error.statusText || m.error_generic()
}
