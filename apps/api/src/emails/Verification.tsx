import { getFirstName } from "@kaja/shared"
import { Heading, Link, Text } from "@react-email/components"
import { render } from "@react-email/render"
import type { EmailPayload } from "./template"
import { EmailContainer } from "./template"

export function Verification({ user, url }: Readonly<EmailPayload>) {
  return (
    <EmailContainer>
      <Heading as="h2">Hey-ho{getFirstName(user.name)} 👋</Heading>
      <Text>
        Click the link to verify your email:
        <br />
        <Link href={url}>Verify Email Link</Link>
      </Text>
    </EmailContainer>
  )
}

export async function getVerificationHtml(payload: Readonly<EmailPayload>) {
  return await render(<Verification {...payload} />)
}
