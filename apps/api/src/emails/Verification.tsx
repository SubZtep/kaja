import { getFirstName } from "@kaja/shared/text"
import { render } from "@react-email/render"
import {
  EmailButton,
  EmailContainer,
  EmailHeading,
  type EmailLanguage,
  type EmailPayload,
  EmailRule,
  EmailText
} from "./template"

export function Verification({
  user,
  url,
  language: { locale, t }
}: Readonly<EmailPayload & { language: EmailLanguage }>) {
  return (
    <EmailContainer locale={locale} t={t} preview={t("email.verificationText")}>
      <EmailHeading>{t("email.greeting", { name: getFirstName(user.name) })}</EmailHeading>
      <EmailText>{t("email.verificationText")}</EmailText>
      <EmailButton href={url} t={t}>
        {t("email.verificationLink")}
      </EmailButton>
      <EmailRule />
      <EmailText small>{t("email.ignore")}</EmailText>
    </EmailContainer>
  )
}

export async function getVerificationHtml(payload: Readonly<EmailPayload>, language: EmailLanguage) {
  return await render(<Verification {...payload} language={language} />)
}
