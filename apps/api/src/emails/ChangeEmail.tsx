import { getFirstName } from "@kaja/shared"
import { Heading, Link, Text } from "@react-email/components"
import { render } from "@react-email/render"
import { type ChangeEmailPayload, EmailContainer, type EmailLanguage } from "./template"

export function ChangeEmail({
  user,
  url,
  newEmail,
  language: { locale, t }
}: Readonly<ChangeEmailPayload & { language: EmailLanguage }>) {
  return (
    <EmailContainer locale={locale}>
      <Heading as="h2">{t("email.greeting", { name: getFirstName(user.name) })}</Heading>
      <Text>
        {t("email.changeEmailText", { oldEmail: user.email, newEmail })}
        <br />
        <Link href={url}>{t("email.changeEmailLink")}</Link>
      </Text>
    </EmailContainer>
  )
}

export async function getChangeEmailHtml(payload: Readonly<ChangeEmailPayload>, language: EmailLanguage) {
  return await render(<ChangeEmail {...payload} language={language} />)
}
