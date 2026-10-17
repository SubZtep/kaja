import { queryDb } from "../src/db"
import { linkTelegram } from "../src/flows"
import { apiText, scenario, t } from "../src/scenario"
import { signUpOnWeb, visit } from "../src/web"

export default scenario(
  "Web: the landing page renders; a picked language is saved and reaches the Telegram bot",
  async ({ stack, page, newPage, newEmail, step }) => {
    const { telegram } = stack
    const email = newEmail()
    const chat = await newPage("telegram")

    step("the landing page for a visitor")
    await visit(page, stack.webUrl)
    await page.getByText(t("hero_tagline")).first().waitFor()
    await page
      .getByRole("link", { name: t("nav_sign_in") })
      .first()
      .waitFor()

    step("sign up and link Telegram, in English")
    await signUpOnWeb(page, stack, email)
    await linkTelegram(stack, page, chat, email)
    const english = apiText("telegram.startLinked")
    const before = telegram.botMessages().at(-1)?.id ?? 0
    await telegram.say(chat, "/start")
    if ((await telegram.waitForReply(before, 20_000)).plain !== english)
      throw new Error("The bot's /start wasn't in English first")

    step("pick Magyar in the footer; the account remembers it")
    await visit(page, stack.webUrl)
    await page.getByRole("combobox", { name: t("language_select_label") }).click()
    await page.getByRole("option", { name: /Magyar/ }).click()
    let saved: string | undefined
    for (const deadline = Date.now() + 15_000; Date.now() < deadline && saved !== "hu-HU"; await Bun.sleep(300)) {
      saved = (await queryDb<{ locale: string }>(stack, `SELECT locale FROM "user" WHERE email = $1`, [email]))[0]
        ?.locale
    }
    if (saved !== "hu-HU") throw new Error(`The saved language is ${saved}, wanted hu-HU`)
    await page.waitForFunction(() => document.documentElement.lang.startsWith("hu"))

    step("the bot now answers this account in that language")
    await Bun.sleep(1500)
    const next = telegram.botMessages().at(-1)?.id ?? 0
    await telegram.say(chat, "/start")
    const reply = (await telegram.waitForReply(next, 20_000)).plain
    if (reply === english) throw new Error("The bot still answers in English")
  }
)
