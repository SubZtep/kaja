import { linkTelegram } from "../src/flows"
import { scenario } from "../src/scenario"
import { signUpOnWeb } from "../src/web"

export default scenario(
  "Telegram: link the account from the web, then chat",
  async ({ stack, page, newPage, newEmail, model, step }) => {
    const { telegram } = stack
    const email = newEmail()

    step("sign up on the web, link Telegram")
    await signUpOnWeb(page, stack, email)
    const chat = await newPage("telegram")
    await linkTelegram(stack, page, chat, email)

    step("chat")
    const before = telegram.botMessages().at(-1)?.id ?? 0
    await model(async () => {
      await telegram.say(chat, "Spell the number 4 in English, one lowercase word only.")
      await telegram.waitForBot(/\bfour\b/i, { after: before, timeoutMs: 90_000 })
    })
  },
  { llm: true }
)
