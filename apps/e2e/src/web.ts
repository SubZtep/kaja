import type { Page } from "playwright-core"
import { waitForCode } from "./mail"
import { t } from "./scenario"
import type { Stack } from "./stack"

async function enterCode(page: Page, email: string, submit: string): Promise<void> {
  await page.getByLabel(t("auth_field_email")).fill(email)
  await page.getByRole("button", { name: t("auth_send_code") }).click()
  await page.getByLabel(t("auth_field_code")).fill(await waitForCode(email))
  await page.getByRole("button", { name: submit }).click()
  await page.waitForURL("**/dashboard")
}

/** Opens a page and waits for the network to go quiet: an SSR'd page filled before React hydrates gets reset. */
export function visit(page: Page, url: string) {
  return page.goto(url, { waitUntil: "networkidle" })
}

/** Creates an account through the sign-up page (both consent boxes ticked) and lands on the dashboard. */
export async function signUpOnWeb(page: Page, stack: Stack, email: string): Promise<void> {
  await visit(page, `${stack.webUrl}/signup`)
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.click()
  await enterCode(page, email, t("signup_submit"))
}

/** Signs an existing account in through the sign-in page. */
export async function signInOnWeb(page: Page, stack: Stack, email: string): Promise<void> {
  await visit(page, `${stack.webUrl}/signin`)
  await enterCode(page, email, t("signin_submit"))
}
