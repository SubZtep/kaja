import { AUTH_MESSAGES } from "@kaja/schema/api"
import { m } from "../paraglide/messages.js"

/** Keyed by the schema's English text, which is what a failed field carries; exported for the coverage test. */
export const VALIDATION: Record<string, () => string> = {
  [AUTH_MESSAGES.invalidEmail]: m.validation_invalid_email,
  [AUTH_MESSAGES.invalidCode]: m.validation_invalid_code,
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
  INVALID_OTP: m.auth_error_invalid_code,
  OTP_EXPIRED: m.auth_error_code_expired,
  TOO_MANY_ATTEMPTS: m.auth_error_too_many_attempts,
  CONSENT_REQUIRED: m.signin_email_no_account,
  USER_ALREADY_EXISTS: m.auth_error_user_exists,
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: m.auth_error_user_exists,
  INVALID_EMAIL: m.validation_invalid_email,
  SESSION_EXPIRED: m.auth_error_session_expired,
  SESSION_NOT_FRESH: m.auth_error_session_expired,
  VERIFICATION_FAILED: m.auth_error_captcha,
  MISSING_RESPONSE: m.auth_error_captcha
}

/** A Better Auth error in the page's language: a known code or a rate limit gets its translation, anything else Better Auth's own (English) message rather than nothing. */
export function authErrorMessage(error: { code?: string; message?: string; status?: number; statusText?: string }) {
  const known = error.code ? AUTH_ERRORS[error.code] : undefined
  if (known) return known()
  if (error.status === 429) return m.auth_error_rate_limited()
  return error.message || error.statusText || m.error_generic()
}
