import { scenario } from "../src/scenario"
import { signInOnWeb, signUpOnWeb } from "../src/web"

export default scenario("Web: sign up, then sign in with an emailed code", async ({ stack, page, newEmail, step }) => {
  const email = newEmail()

  step("sign up with consent")
  await signUpOnWeb(page, stack, email)

  step("sign out and sign in again")
  await page.context().clearCookies()
  await signInOnWeb(page, stack, email)
})
