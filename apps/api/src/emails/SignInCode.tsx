import { getFirstName } from "@kaja/shared/text"
import { render } from "@react-email/render"
import {
  EmailCode,
  EmailContainer,
  EmailHeading,
  type EmailLanguage,
  EmailRule,
  EmailText,
  type SignInCodePayload
} from "./template"

export function SignInCode({
  name,
  otp,
  language: { locale, t }
}: Readonly<SignInCodePayload & { language: EmailLanguage }>) {
  return (
    <EmailContainer locale={locale} t={t} preview={t("email.signInCodeText")}>
      <EmailHeading>{t("email.greeting", { name: getFirstName(name) })}</EmailHeading>
      <EmailText>{t("email.signInCodeText")}</EmailText>
      <EmailCode code={otp} />
      <EmailRule />
      <EmailText small>{t("email.signInCodeIgnore")}</EmailText>
    </EmailContainer>
  )
}

export async function getSignInCodeHtml(payload: Readonly<SignInCodePayload>, language: EmailLanguage) {
  return await render(<SignInCode {...payload} language={language} />)
}
