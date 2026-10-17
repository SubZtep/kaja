import { linkTelegram } from "../src/flows"
import { apiText, scenario, t } from "../src/scenario"
import { signUpOnWeb } from "../src/web"

export default scenario(
  "Telegram: disconnecting on the web stops the bot answering",
  async ({ stack, page, newPage, newEmail, step }) => {
    const { telegram } = stack
    const email = newEmail()
    const chat = await newPage("telegram")

    step("sign up and link Telegram")
    await signUpOnWeb(page, stack, email)
    await linkTelegram(stack, page, chat, email)

    step("disconnect on the dashboard")
    // The dashboard doesn't notice a link made elsewhere until it loads again
    await page.reload({ waitUntil: "networkidle" })
    await page.getByRole("button", { name: t("telegram_unlink") }).click()
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: t("telegram_unlink") })
      .click()
    await page.getByText(t("telegram_unlinked")).first().waitFor()

    step("the bot now asks to link again")
    const before = telegram.botMessages().at(-1)?.id ?? 0
    await telegram.say(chat, "are you still there?")
    const reply = await telegram.waitForReply(before, 20_000)
    if (reply.plain !== apiText("telegram.notLinked")) throw new Error(`The bot answered: ${reply.plain}`)
  },
  { video: true }
)
