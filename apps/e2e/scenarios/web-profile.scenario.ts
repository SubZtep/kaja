import { queryDb } from "../src/db"
import { waitForCode } from "../src/mail"
import { scenario, t } from "../src/scenario"
import { signInOnWeb, signUpOnWeb, visit } from "../src/web"

export default scenario(
  "Web: edit the profile, change the email with two codes, delete the account",
  async ({ stack, page, newEmail, step }) => {
    const email = newEmail()
    const newAddress = newEmail()

    step("sign up and open the profile")
    await signUpOnWeb(page, stack, email)
    await visit(page, `${stack.webUrl}/profile`)

    step("change the name")
    await page.getByLabel(t("profile_field_name")).fill("Ada E2E")
    await page.getByRole("button", { name: t("profile_save_changes") }).click()
    await page.getByText(t("profile_success_user_updated")).first().waitFor()
    await page.reload({ waitUntil: "networkidle" })
    if ((await page.getByLabel(t("profile_field_name")).inputValue()) !== "Ada E2E")
      throw new Error("The name wasn't saved")

    step("change the email: approve from the old address, confirm the new one")
    await page.getByLabel(t("profile_field_new_email")).fill(newAddress)
    await page.getByRole("button", { name: t("auth_send_code") }).click()
    await page.getByText(t("profile_email_step_current")).waitFor()
    await page.getByLabel(t("auth_field_code")).fill(await waitForCode(email))
    await page.getByRole("button", { name: t("profile_email_approve") }).click()
    await page.getByText(t("profile_email_step_new")).waitFor()
    await page.getByLabel(t("auth_field_code")).fill(await waitForCode(newAddress))
    await page.getByRole("button", { name: t("profile_update_email") }).click()
    await page.getByText(t("profile_success_email_updated")).first().waitFor()
    await page.getByText(t("profile_signed_in_as", { email: newAddress })).waitFor()

    step("the old address no longer has an account, the new one signs in")
    await page.context().clearCookies()
    await visit(page, `${stack.webUrl}/signin`)
    await page.getByLabel(t("auth_field_email")).fill(email)
    await page.getByRole("button", { name: t("auth_send_code") }).click()
    await page.getByLabel(t("auth_field_code")).fill(await waitForCode(email))
    await page.getByRole("button", { name: t("signin_submit") }).click()
    await page.getByText(t("signin_email_no_account")).waitFor()
    await signInOnWeb(page, stack, newAddress)

    step("delete the account")
    await visit(page, `${stack.webUrl}/profile`)
    await page.getByRole("button", { name: t("profile_delete_button") }).click()
    const dialog = page.getByRole("alertdialog")
    await dialog.getByRole("textbox").fill(newAddress)
    await dialog.getByRole("button", { name: t("profile_delete_confirm_button"), exact: true }).click()
    // The page leaves for the landing page, taking its toast along
    await page.waitForURL(url => !url.pathname.startsWith("/profile"))
    await page.waitForLoadState("networkidle")
    const left = await queryDb(stack, `SELECT 1 FROM "user" WHERE email = $1`, [newAddress])
    if (left.length !== 0) throw new Error("The user row is still there after deleting the account")
  }
)
