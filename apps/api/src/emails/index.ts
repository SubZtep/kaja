import { error, info, warn } from "@kaja/logger"
import nodemailer from "nodemailer"
import { env } from "../core/env"
import { getChangeEmailHtml } from "./ChangeEmail"
import { getResetPasswordHtml } from "./ResetPassword"
import type { SendEmailArgs } from "./template"
import { getVerificationHtml } from "./Verification"

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE ?? false,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS
  }
})

if (!env.CI) {
  void (async () => {
    try {
      const verified = await transporter.verify()
      info("SMTP server is ready to take our messages", { verified })
    } catch (err) {
      warn("SMTP verification failed", { error: err })
    }
  })()
}

export async function sendEmail({ type, payload }: Readonly<SendEmailArgs>) {
  const from = "kaja[bot] <noreply@kaja.io>"
  const to = payload.user.email
  let subject: string
  let html: string

  switch (type) {
    case "changeEmail":
      html = await getChangeEmailHtml(payload)
      subject = `[kaja.io] Change your email address`
      break
    case "verification":
      html = await getVerificationHtml(payload)
      subject = `[kaja.io] Verify your email address`
      break
    case "resetPassword":
      html = await getResetPasswordHtml(payload)
      subject = `[kaja.io] Reset your password`
      break
  }

  try {
    await transporter.sendMail({ from, to, subject, html })
  } catch (err) {
    if (err instanceof Error) {
      error("Email sending error", { error: err.message })
      throw err
    }
    error("Email sending error", { error: "Unknown error" })
    throw new Error("Unknown error")
  }
}
