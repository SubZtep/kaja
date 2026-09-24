import { getFirstName } from "@kaja/shared"
import { Heading, Link, Text } from "@react-email/components"
import { render } from "@react-email/render"
import { EmailContainer, type EmailLanguage, type EmailPayload } from "./template"

export function ResetPassword({
  user,
  url,
  language: { locale, t }
}: Readonly<EmailPayload & { language: EmailLanguage }>) {
  return (
    <EmailContainer locale={locale}>
      <Heading as="h2">{t("email.greeting", { name: getFirstName(user.name) })}</Heading>
      <Text>
        {t("email.resetPasswordText")}
        <br />
        <Link href={url}>{t("email.resetPasswordLink")}</Link>
      </Text>
    </EmailContainer>
  )
}

export async function getResetPasswordHtml(payload: Readonly<EmailPayload>, language: EmailLanguage) {
  return await render(<ResetPassword {...payload} language={language} />)
}
