import { getFirstName } from "@kaja/shared/text"
import { render } from "@react-email/render"
import {
  type ChangeEmailPayload,
  EmailButton,
  EmailContainer,
  EmailHeading,
  type EmailLanguage,
  EmailRule,
  EmailText
} from "./template"

export function ChangeEmail({
  user,
  url,
  newEmail,
  language: { locale, t }
}: Readonly<ChangeEmailPayload & { language: EmailLanguage }>) {
  const text = t("email.changeEmailText", { oldEmail: user.email, newEmail })
  return (
    <EmailContainer locale={locale} t={t} preview={text}>
      <EmailHeading>{t("email.greeting", { name: getFirstName(user.name) })}</EmailHeading>
      <EmailText>{text}</EmailText>
      <EmailButton href={url} t={t}>
        {t("email.changeEmailLink")}
      </EmailButton>
      <EmailRule />
      <EmailText small>{t("email.ignore")}</EmailText>
    </EmailContainer>
  )
}

export async function getChangeEmailHtml(payload: Readonly<ChangeEmailPayload>, language: EmailLanguage) {
  return await render(<ChangeEmail {...payload} language={language} />)
}
