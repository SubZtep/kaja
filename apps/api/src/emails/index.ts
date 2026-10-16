import nodemailer from "nodemailer"
import { env } from "../core/env"
import { toLocale, translator } from "../core/i18n"
import { getCodeHtml } from "./CodeEmail"
import type { CodeEmailPayload } from "./template"

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
      await transporter.verify()
    } catch (err) {
      console.warn("SMTP verification failed", { error: err })
    }
  })()
}

export async function sendEmail(payload: Readonly<CodeEmailPayload>) {
  const from = "kaja[bot] <noreply@kaja.io>"
  const locale = toLocale(payload.locale)
  const language = { locale, t: translator(locale) }
  const subject = language.t(`email.${payload.purpose}CodeSubject`, { otp: payload.otp })
  const html = await getCodeHtml(payload, language)

  try {
    await transporter.sendMail({ from, to: payload.email, subject, html })
  } catch (err) {
    throw err instanceof Error ? err : new Error("Unknown error")
  }
}
