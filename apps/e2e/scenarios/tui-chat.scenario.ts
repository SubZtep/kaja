import { scenario, tuiText } from "../src/scenario"
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
      step("first-run setup")
      await tui.waitFor(tuiText("wizard.languageTitle"))
      tui.press("enter")
      await tui.waitFor(tuiText("wizard.themeTitle"))
      tui.press("enter")

      step("sign in")
      await tui.waitFor(tuiText("cli.pleaseSignIn"))
      await tui.waitFor(tuiText("cli.deviceLoginOpened"))

      step("approve the device in the browser")
      const [url] = tui.openedUrls()
      if (!url) throw new Error("The TUI never opened its sign-in page")
      await page.goto(url, { waitUntil: "networkidle" })
      await page.getByRole("button", { name: "Approve" }).click()
      await page.getByText("Device approved").waitFor()

      step("chat")
      // The key bar is the last thing the chat screen draws
      await tui.waitFor("Esc Quit")
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
