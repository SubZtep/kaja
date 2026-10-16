import nodemailer from "nodemailer"
import { env } from "../core/env"
import { toLocale, translator } from "../core/i18n"
import { getChangeEmailHtml } from "./ChangeEmail"
import { getSignInCodeHtml } from "./SignInCode"
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
      await transporter.verify()
    } catch (err) {
      console.warn("SMTP verification failed", { error: err })
    }
  })()
}

export async function sendEmail({ type, payload }: Readonly<SendEmailArgs>) {
  const from = "kaja[bot] <noreply@kaja.io>"
  const to = type === "signInCode" ? payload.email : payload.user.email
  const locale = toLocale(type === "signInCode" ? payload.locale : payload.user.locale)
  const language = { locale, t: translator(locale) }
  const subject = language.t(`email.${type}Subject`, type === "signInCode" ? { otp: payload.otp } : undefined)
  let html: string

  switch (type) {
    case "changeEmail":
      html = await getChangeEmailHtml(payload, language)
      break
    case "verification":
      html = await getVerificationHtml(payload, language)
      break
    case "signInCode":
      html = await getSignInCodeHtml(payload, language)
      break
  }

  try {
    await transporter.sendMail({ from, to, subject, html })
  } catch (err) {
    throw err instanceof Error ? err : new Error("Unknown error")
  }
}
