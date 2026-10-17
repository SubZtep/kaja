import { linkTelegram } from "../src/flows"
import { apiText, scenario } from "../src/scenario"
import { signUpOnWeb } from "../src/web"

export default scenario(
  "Telegram: groups are ignored, and a second message mid-turn is told to wait",
  async ({ stack, page, newPage, newEmail, step }) => {
    const { telegram } = stack
    const email = newEmail()
    const chat = await newPage("telegram")

    step("sign up and link Telegram")
    await signUpOnWeb(page, stack, email)
    await linkTelegram(stack, page, chat, email)

    step("a message from a group chat gets no answer")
    const before = telegram.botMessages().length
    await telegram.sayInGroup("hello from the group")
    await Bun.sleep(4000)
    if (telegram.botMessages().length !== before) throw new Error("The bot answered in a group")

    step("a second message while the first is running")
    const last = telegram.botMessages().at(-1)?.id ?? 0
    await telegram.say(chat, "Write a story of about 200 words about a fox who learns to swim.")
    await telegram.say(chat, "hello?")
    await telegram.waitForBot(apiText("telegram.stillWorking"), { after: last, timeoutMs: 30_000 })
  },
  { llm: true }
)
