import { z } from "zod"

/** The form validation messages, named so a client can show its own translation of each (the web maps them in `lib/error-messages.ts`); everyone else gets the English. */
export const AUTH_MESSAGES = {
  passwordMin: "Password must be at least 8 characters",
  passwordMax: "Password too long",
  passwordLowercase: "Must include a lowercase letter",
  passwordUppercase: "Must include an uppercase letter",
  passwordNumber: "Must include a number",
  passwordSpecial: "Must include a special character",
  invalidEmail: "Invalid email address",
  nameMin: "Name must be at least 2 characters",
  nameMax: "Name must be at most 100 characters"
} as const

/**
 * Password rules:
 * - 8–72 chars (bcrypt safe range)
 * - at least 1 lowercase
 * - at least 1 uppercase
 * - at least 1 number
 * - at least 1 special char
 */
const passwordSchema = z
  .string()
  .min(8, AUTH_MESSAGES.passwordMin)
  .max(72, AUTH_MESSAGES.passwordMax)
  .regex(/[a-z]/, AUTH_MESSAGES.passwordLowercase)
  .regex(/[A-Z]/, AUTH_MESSAGES.passwordUppercase)
  .regex(/\d/, AUTH_MESSAGES.passwordNumber)
  .regex(/[^a-zA-Z\d]/, AUTH_MESSAGES.passwordSpecial)

export const loginSchema = z.object({
  email: z.email(AUTH_MESSAGES.invalidEmail).trim().toLowerCase(),
  password: z.string(),
  rememberMe: z.boolean()
})

/** A blank name is fine (a Google sign-in can fill it later); a given one is at least 2 characters. */
const nameSchema = z
  .string()
  .trim()
  .max(100, AUTH_MESSAGES.nameMax)
  .refine(name => name === "" || name.length >= 2, AUTH_MESSAGES.nameMin)

export const registerSchema = z.object({
  name: nameSchema,
  email: z.email(AUTH_MESSAGES.invalidEmail).trim().toLowerCase(),
  password: passwordSchema,
  image: z.string()
})

export const editSchema = z.object({
  name: nameSchema,
  image: z.string()
})

export const editEmailSchema = z.object({
  newEmail: z.email(AUTH_MESSAGES.invalidEmail).trim().toLowerCase()
})

export const changePasswordSchema = z.object({
  newPassword: passwordSchema,
  currentPassword: z.string(),
  revokeOtherSessions: z.boolean()
})

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type EditInput = z.infer<typeof editSchema>
export type EditEmailInput = z.infer<typeof editEmailSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
