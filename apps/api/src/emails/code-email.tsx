import { getFirstName } from "@kaja/shared/text"
import { render } from "@react-email/render"
import {
  type CodeEmailPayload,
  EmailCode,
  EmailContainer,
  EmailHeading,
  type EmailLanguage,
  EmailRule,
  EmailText
} from "./template"

function CodeEmail({
  purpose,
  name,
  otp,
  language: { locale, t }
}: Readonly<CodeEmailPayload & { language: EmailLanguage }>) {
  return (
    <EmailContainer locale={locale} t={t} preview={t(`email.${purpose}CodeText`)}>
      <EmailHeading>{t("email.greeting", { name: getFirstName(name) })}</EmailHeading>
      <EmailText>{t(`email.${purpose}CodeText`)}</EmailText>
      <EmailCode code={otp} />
      <EmailRule />
      <EmailText small>{t(`email.${purpose}CodeIgnore`)}</EmailText>
    </EmailContainer>
  )
}

export function getCodeHtml(payload: Readonly<CodeEmailPayload>, language: EmailLanguage) {
  return render(<CodeEmail {...payload} language={language} />)
}
