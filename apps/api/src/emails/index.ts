import { isItTrue } from "@kaja/shared"
import nodemailer from "nodemailer"
import { logger } from "../core/logger"
import { getChangeEmailHtml } from "./ChangeEmail"
import { getResetPasswordHtml } from "./ResetPassword"
import type { SendEmailArgs } from "./template"
import { getVerificationHtml } from "./Verification"

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: isItTrue(process.env.SMTP_SECURE),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

if (!process.env.CI) {
  void (async () => {
    try {
      const verified = await transporter.verify()
      logger.info({ verified }, "SMTP server is ready to take our messages")
    } catch (error) {
      logger.warn({ error }, "SMTP verification failed")
    }
  })()
}

export async function sendEmail({ type, payload }: Readonly<SendEmailArgs>) {
  const from = process.env.EMAIL_FROM
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
  } catch (error) {
    if (error instanceof Error) {
      logger.error({ error: error.message }, "Email sending error")
      throw error
    }
    logger.error({ error: "Unknown error" }, "Email sending error")
    throw new Error("Unknown error")
  }
}
