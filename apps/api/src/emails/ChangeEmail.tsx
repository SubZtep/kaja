import { getFirstName } from "@kaja/shared"
import { Heading, Link, Text } from "@react-email/components"
import { render } from "@react-email/render"
import { type ChangeEmailPayload, EmailContainer } from "./template"

export function ChangeEmail({ user, url, newEmail }: Readonly<ChangeEmailPayload>) {
  return (
    <EmailContainer>
      <Heading as="h2">Hey-ho{getFirstName(user.name)} 👋</Heading>
      <Text>
        Click the link to approve the change from {user.email} to {newEmail}:
        <br />
        <Link href={url}>Change Email Link</Link>
      </Text>
    </EmailContainer>
  )
}

export async function getChangeEmailHtml(payload: Readonly<ChangeEmailPayload>) {
  return await render(<ChangeEmail {...payload} />)
}
