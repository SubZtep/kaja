import { e2eEnv } from "./env"

type MailDevEmail = { id: string; time: string; subject: string; to: { address: string }[] }

const used = new Set<string>()

/** Waits for the next sign-in code emailed to `address` that no earlier call returned (MailDev's times are whole seconds, so ids tell mails apart). */
export async function waitForCode(address: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const response = await fetch(`${e2eEnv.E2E_MAILDEV_URL}/api/email`)
    const emails = (await response.json()) as MailDevEmail[]
    for (const mail of emails) {
      if (used.has(mail.id) || !mail.to.some(to => to.address === address)) continue
      const code = /\b(\d{6})\b/.exec(mail.subject)?.[1]
      if (!code) continue
      used.add(mail.id)
      return code
    }
    await Bun.sleep(300)
  }
  throw new Error(`No sign-in code arrived for ${address} within ${timeoutMs} ms`)
}
