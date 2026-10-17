import { apiText, scenario, t } from "../src/scenario"
import { signUpOnWeb } from "../src/web"

export default scenario(
  "Telegram: link the account from the web, then chat",
  async ({ stack, page, newPage, newEmail, model, step }) => {
    const { telegram } = stack
    const email = newEmail()

    step("sign up on the web and ask for a Telegram link")
    await signUpOnWeb(page, stack, email)
    await page.getByRole("button", { name: t("telegram_connect_button") }).click()
    const link = await page.getByRole("link", { name: /t\.me\// }).getAttribute("href")
    if (!link) throw new Error("The web page showed no Telegram link")

    step("open the link in Telegram and confirm")
    const chat = await newPage("telegram")
    await chat.goto(telegram.url)
    await telegram.openLink(chat, link)
    await telegram.waitForBot(email)
    await telegram.press(chat, apiText("telegram.linkConfirm"))
    // The message is the question's text edited into "linked", so wait for the new wording
    await telegram.waitForBot("Send a message to start chatting")

    step("chat")
    const before = telegram.botMessages().at(-1)?.id ?? 0
    await model(async () => {
      await telegram.say(chat, "Spell the number 4 in English, one lowercase word only.")
      await telegram.waitForBot(/\bfour\b/i, { after: before, timeoutMs: 90_000 })
    })
  },
  { llm: true }
)
