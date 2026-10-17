import { waitForCode } from "../src/mail"
import { scenario, t } from "../src/scenario"

export default scenario("Web: sign up, then sign in with an emailed code", async ({ stack, page, newEmail, step }) => {
  const email = newEmail()

  step("sign up with consent")
  await page.goto(`${stack.webUrl}/signup`, { waitUntil: "networkidle" })
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.click()
  await page.getByLabel(t("auth_field_email")).fill(email)
  await page.getByRole("button", { name: t("auth_send_code") }).click()
  await page.getByLabel(t("auth_field_code")).fill(await waitForCode(email))
  await page.getByRole("button", { name: t("signup_submit") }).click()
  await page.waitForURL("**/dashboard")

  step("sign out and sign in again")
  await page.context().clearCookies()
  await page.goto(`${stack.webUrl}/signin`, { waitUntil: "networkidle" })
  await page.getByLabel(t("auth_field_email")).fill(email)
  await page.getByRole("button", { name: t("auth_send_code") }).click()
  await page.getByLabel(t("auth_field_code")).fill(await waitForCode(email))
  await page.getByRole("button", { name: t("signin_submit") }).click()
  await page.waitForURL("**/dashboard")
})
