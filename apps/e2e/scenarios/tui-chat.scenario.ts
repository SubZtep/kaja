import { loginTui } from "../src/flows-tui"
import { scenario } from "../src/scenario"
import { startTui } from "../src/tui"
import { signUpOnWeb } from "../src/web"

export default scenario(
  "TUI: sign in through the browser, then chat",
  async ({ stack, page, newPage, newEmail, model, step }) => {
    step("sign up on the web")
    await signUpOnWeb(page, stack, newEmail())

    step("start the terminal app")
    const tui = await startTui(stack, await newPage("tui"))
    try {
      step("first-run setup, then the device login")
      await loginTui(page, tui)

      step("chat")
      await model(async () => {
        await tui.submit("Spell the number 4 in English, one lowercase word only.")
        await tui.waitFor(/\bfour\b/i, 90_000)
      })
    } finally {
      await tui.stop()
    }
  },
  { llm: true }
)
