import type { Page } from "playwright-core"
import { tuiText } from "./scenario"
import type { Tui } from "./tui"

/** Quits the way a person does: Esc, and Esc again if the app is still busy starting up and swallowed the first one. */
export async function quitTui(tui: Tui): Promise<void> {
  await Bun.sleep(1000)
  for (let attempt = 1; ; attempt++) {
    tui.press("escape")
    try {
      await tui.waitForExit(8000)
      return
    } catch (error) {
      if (attempt === 3) throw error
    }
  }
}

/** The first launch's way in: the setup wizard (language, colours), then the device login approved on the signed-in web page. Ends on the chat screen. */
export async function loginTui(web: Page, tui: Tui): Promise<void> {
  await tui.waitFor(tuiText("wizard.languageTitle"))
  tui.press("enter")
  await tui.waitFor(tuiText("wizard.themeTitle"))
  tui.press("enter")
  await tui.waitFor(tuiText("cli.pleaseSignIn"))
  await tui.waitFor(tuiText("cli.deviceLoginOpened"))
  const [url] = tui.openedUrls()
  if (!url) throw new Error("The TUI never opened its sign-in page")
  await web.goto(url, { waitUntil: "networkidle" })
  await web.getByRole("button", { name: "Approve" }).click()
  await web.getByText("Device approved").waitFor()
  // The key bar is the last thing the chat screen draws
  await tui.waitFor("Esc Quit")
}
