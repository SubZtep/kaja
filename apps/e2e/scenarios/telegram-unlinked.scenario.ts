import { signUp } from "../src/api"
import { apiText, scenario } from "../src/scenario"

export default scenario(
  "Telegram: an unlinked chat is told to link, and a cancelled link stays unlinked",
  async ({ stack, newPage, newEmail, step }) => {
    const { telegram } = stack
    const chat = await newPage("telegram")
    await chat.goto(telegram.url)
    const lastId = () => telegram.botMessages().at(-1)?.id ?? 0
    const say = async (text: string) => {
      const before = lastId()
      await telegram.say(chat, text)
      return (await telegram.waitForReply(before, 20_000)).plain
    }
    const plain = (key: string) => apiText(key).replace(/<[^>]*>/g, "")

    step("a message before linking")
    const first = await say("hello?")
    if (first !== plain("telegram.notLinked")) throw new Error(`No link prompt for a plain message: ${first}`)

    step("/start with no token, and with a bad one")
    if ((await say("/start")) !== plain("telegram.startWithoutLink")) throw new Error("Wrong /start answer")
    if ((await say("/start not-a-real-token")) !== plain("telegram.linkExpired"))
      throw new Error("A bad token wasn't refused")

    step("a real link, cancelled")
    const user = await signUp(stack, newEmail())
    const { token, botUsername } = await user.json<{ token: string; botUsername: string }>(
      "POST",
      "/telegram/admin/link"
    )
    await telegram.openLink(chat, `https://t.me/${botUsername}?start=${token}`)
    await telegram.waitForBot(user.email)
    await telegram.press(chat, apiText("telegram.linkCancel"))
    await telegram.waitForBot(plain("telegram.linkCancelled"))

    step("still unlinked")
    if ((await say("anyone there?")) !== plain("telegram.notLinked")) throw new Error("Cancelling linked the account")
  },
  { video: true }
)
