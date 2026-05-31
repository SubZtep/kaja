import { z } from "zod"

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
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password too long")
  .regex(/[a-z]/, "Must include a lowercase letter")
  .regex(/[A-Z]/, "Must include an uppercase letter")
  .regex(/\d/, "Must include a number")
  .regex(/[^a-zA-Z\d]/, "Must include a special character")

export const loginSchema = z.object({
  email: z.email("Invalid email address").trim().toLowerCase(),
  password: z.string(),
  rememberMe: z.boolean()
})

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.email("Invalid email address").trim().toLowerCase(),
  password: passwordSchema,
  image: z.string()
})

export const editSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  image: z.string()
})

export const editEmailSchema = z.object({
  newEmail: z.email("Invalid email address").trim().toLowerCase()
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
