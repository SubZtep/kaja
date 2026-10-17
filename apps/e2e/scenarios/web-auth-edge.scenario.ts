import { signUp } from "../src/api"
import { queryDb } from "../src/db"
import { waitForCode } from "../src/mail"
import { scenario, t } from "../src/scenario"
import { visit } from "../src/web"

export default scenario(
  "Web: sign-up needs consent, a wrong code is refused, an unknown address has no account",
  async ({ stack, page, newEmail, step }) => {
    step("sign-up without the consent boxes sends nothing")
    const stranger = newEmail()
    await visit(page, `${stack.webUrl}/signup`)
    await page.getByLabel(t("auth_field_email")).fill(stranger)
    await page.getByRole("button", { name: t("auth_send_code") }).click()
    await page.getByText(t("signup_consent_required")).first().waitFor()
    await Bun.sleep(1500)
    const mails = await fetch(`${stack.mailUrl}/api/email`).then(
      r => r.json() as Promise<{ to: { address: string }[] }[]>
    )
    if (mails.some(mail => mail.to.some(to => to.address === stranger)))
      throw new Error("A code was sent without consent")

    step("an unknown address on the sign-in page has no account")
    await visit(page, `${stack.webUrl}/signin`)
    await page.getByLabel(t("auth_field_email")).fill(stranger)
    await page.getByRole("button", { name: t("auth_send_code") }).click()
    await page.getByLabel(t("auth_field_code")).fill(await waitForCode(stranger))
    await page.getByRole("button", { name: t("signin_submit") }).click()
    await page.getByText(t("signin_email_no_account")).waitFor()
    if ((await queryDb(stack, `SELECT 1 FROM "user" WHERE email = $1`, [stranger])).length !== 0)
      throw new Error("Signing in created an account")

    step("a wrong code is refused, the right one still works")
    const member = newEmail()
    await signUp(stack, member)
    await page.context().clearCookies()
    await visit(page, `${stack.webUrl}/signin`)
    await page.getByLabel(t("auth_field_email")).fill(member)
    await page.getByRole("button", { name: t("auth_send_code") }).click()
    const code = await waitForCode(member)
    await page.getByLabel(t("auth_field_code")).fill(code === "000000" ? "111111" : "000000")
    await page.getByRole("button", { name: t("signin_submit") }).click()
    await Bun.sleep(1500)
    if (page.url().includes("/dashboard")) throw new Error("A wrong code signed in")
    await page.getByLabel(t("auth_field_code")).fill(code)
    await page.getByRole("button", { name: t("signin_submit") }).click()
    await page.waitForURL("**/dashboard")
  }
)
