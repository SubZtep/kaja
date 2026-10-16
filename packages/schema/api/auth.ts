import { z } from "zod"

/** The form validation messages, named so a client can show its own translation of each (the web maps them in `lib/error-messages.ts`); everyone else gets the English. */
export const AUTH_MESSAGES = {
  invalidEmail: "Invalid email address",
  invalidCode: "Enter the 6-digit code from the email",
  nameMin: "Name must be at least 2 characters",
  nameMax: "Name must be at most 100 characters"
} as const

const emailSchema = z.email(AUTH_MESSAGES.invalidEmail).trim().toLowerCase()

/** The email a sign-in code goes to. */
export const loginSchema = z.object({
  email: emailSchema
})

/** The emailed sign-in code; spaces a user pastes along with it are dropped. */
export const signInCodeSchema = z.object({
  otp: z
    .string()
    .transform(code => code.replaceAll(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, AUTH_MESSAGES.invalidCode))
})

/** A blank name is fine (a Google sign-in can fill it later); a given one is at least 2 characters. */
const nameSchema = z
  .string()
  .trim()
  .max(100, AUTH_MESSAGES.nameMax)
  .refine(name => name === "" || name.length >= 2, AUTH_MESSAGES.nameMin)

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  image: z.string()
})

export const editSchema = z.object({
  name: nameSchema,
  image: z.string()
})

export const editEmailSchema = z.object({
  newEmail: emailSchema
})

export type LoginInput = z.infer<typeof loginSchema>
export type SignInCodeInput = z.infer<typeof signInCodeSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type EditInput = z.infer<typeof editSchema>
export type EditEmailInput = z.infer<typeof editEmailSchema>
