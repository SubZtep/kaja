import { getFirstName } from "@kaja/shared"
import { Heading, Link, Text } from "@react-email/components"
import { render } from "@react-email/render"
import { EmailContainer, type EmailPayload } from "./template"

export function ResetPassword({ user, url }: Readonly<EmailPayload>) {
  return (
    <EmailContainer>
      <Heading as="h2">Hey-ho{getFirstName(user.name)} 👋</Heading>
      <Text>
        Click the link to reset your password:
        <br />
        <Link href={url}>Reset Password Link</Link>
      </Text>
    </EmailContainer>
  )
}

export async function getResetPasswordHtml(payload: Readonly<EmailPayload>) {
  return await render(<ResetPassword {...payload} />)
}
