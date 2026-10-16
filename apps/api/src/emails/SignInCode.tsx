import { getFirstName } from "@kaja/shared/text"
import { Heading, Text } from "@react-email/components"
import { render } from "@react-email/render"
import { EmailContainer, type EmailLanguage, type SignInCodePayload } from "./template"

export function SignInCode({
  name,
  otp,
  language: { locale, t }
}: Readonly<SignInCodePayload & { language: EmailLanguage }>) {
  return (
    <EmailContainer locale={locale}>
      <Heading as="h2">{t("email.greeting", { name: getFirstName(name) })}</Heading>
      <Text>{t("email.signInCodeText")}</Text>
      <Heading as="h1" style={{ letterSpacing: "8px" }}>
        {otp}
      </Heading>
      <Text>{t("email.signInCodeIgnore")}</Text>
    </EmailContainer>
  )
}

export async function getSignInCodeHtml(payload: Readonly<SignInCodePayload>, language: EmailLanguage) {
  return await render(<SignInCode {...payload} language={language} />)
}
