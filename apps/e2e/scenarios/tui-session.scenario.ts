import { loginTui } from "../src/flows-tui"
import { scenario, tuiText } from "../src/scenario"
import { startTui } from "../src/tui"
import { signUpOnWeb } from "../src/web"

export default scenario(
  "TUI: the login survives a restart, and logout asks for it again",
  async ({ stack, page, newPage, newEmail, step }) => {
    step("sign up, first launch, log in")
    await signUpOnWeb(page, stack, newEmail())
    const first = await startTui(stack, await newPage("first"))
    try {
      await loginTui(page, first)
      first.press("escape")
      await first.waitForExit()
    } finally {
      await first.stop()
    }

    step("the second launch goes straight to the chat")
    const second = await startTui(stack, await newPage("second"), ["--cloud"], { fresh: false })
    try {
      const screen = await second.waitFor("Esc Quit")
      if (screen.includes(tuiText("cli.pleaseSignIn"))) throw new Error("The restart asked for a login")
      second.press("escape")
      await second.waitForExit()
    } finally {
      await second.stop()
    }

    step("kaja logout")
    const logout = await startTui(stack, await newPage("logout"), ["logout"], { fresh: false })
    try {
      await logout.waitFor(tuiText("cli.logoutSuccess"))
      await logout.waitForExit()
    } finally {
      await logout.stop()
    }

    step("the next launch wants a login again")
    const third = await startTui(stack, await newPage("third"), ["--cloud"], { fresh: false })
    try {
      await third.waitFor(tuiText("cli.pleaseSignIn"))
    } finally {
      await third.stop()
    }
  }
)
