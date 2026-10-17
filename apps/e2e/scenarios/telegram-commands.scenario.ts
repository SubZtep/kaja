import { sessionCount } from "../src/db"
import { linkTelegram } from "../src/flows"
import { apiText, scenario } from "../src/scenario"
import { signUpOnWeb } from "../src/web"

export default scenario(
  "Telegram: /compact keeps the conversation, /new starts a fresh one",
  async ({ stack, page, newPage, newEmail, model, step }) => {
    const { telegram } = stack
    const email = newEmail()
    const lastId = () => telegram.botMessages().at(-1)?.id ?? 0
    const chat = await newPage("telegram")

    // Asks something and waits for the bot's answer; returns its text
    const ask = async (text: string, timeoutMs = 90_000) => {
      const before = lastId()
      await telegram.say(chat, text)
      const reply = (await telegram.waitForReply(before, timeoutMs)).plain
      // The turn is still wrapping up for a moment after its answer, and a message then gets "still working"
      await Bun.sleep(2500)
      return reply
    }

    step("sign up and link Telegram")
    await signUpOnWeb(page, stack, email)
    await linkTelegram(stack, page, chat, email)

    step("a short conversation holding a fact")
    await ask("Remember: my cat is called Biscuit. Then say one sentence about cats.")
    await ask("Give me two short facts about the moon.")
    await ask("Now two short facts about the sea.")

    step("/compact summarises it")
    const compacted = await ask("/compact keep the cat's name")
    const expected = apiText("telegram.compacted").split("{")[0]?.trim() ?? ""
    if (!compacted.includes(expected)) throw new Error(`/compact answered: ${compacted}`)

    step("the cat's name survived")
    await model(async () => {
      const reply = await ask("What is my cat called? Reply with only the name.")
      if (!/biscuit/i.test(reply)) throw new Error(`Unexpected reply: ${reply}`)
    })

    step("/new starts a second session")
    if ((await sessionCount(stack, email, "telegram")) !== 1) throw new Error("The chat so far isn't one session")
    const started = await ask("/new")
    if (started !== apiText("telegram.newSession")) throw new Error(`/new answered: ${started}`)
    await ask("Hi again! Reply with one short sentence.")
    const sessions = await sessionCount(stack, email, "telegram")
    if (sessions !== 2) throw new Error(`Expected 2 Telegram sessions after /new, found ${sessions}`)
  },
  { llm: true }
)
