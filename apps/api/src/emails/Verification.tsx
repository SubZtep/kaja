import { getFirstName } from "@kaja/shared"
import { Heading, Link, Text } from "@react-email/components"
import { render } from "@react-email/render"
import { EmailContainer, type EmailLanguage, type EmailPayload } from "./template"

export function Verification({
  user,
  url,
  language: { locale, t }
}: Readonly<EmailPayload & { language: EmailLanguage }>) {
  return (
    <EmailContainer locale={locale}>
      <Heading as="h2">{t("email.greeting", { name: getFirstName(user.name) })}</Heading>
      <Text>
        {t("email.verificationText")}
        <br />
        <Link href={url}>{t("email.verificationLink")}</Link>
      </Text>
    </EmailContainer>
  )
}

export async function getVerificationHtml(payload: Readonly<EmailPayload>, language: EmailLanguage) {
  return await render(<Verification {...payload} language={language} />)
}
