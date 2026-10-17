import { quitTui } from "../src/flows-tui"
import { scenario } from "../src/scenario"
import { startTui, writeLocalConfig } from "../src/tui"

export default scenario(
  "TUI --local: the agent runs on this computer, sessions are kept and resumed",
  async ({ stack, newPage, model, step }) => {
    if (!stack.llm) throw new Error("This scenario needs a model")
    // The first launch wipes the home; the config goes in after, so write it before a launch that keeps the home
    const first = await startTui(stack, await newPage("local"), ["--local"], {
      fresh: true,
      config: () => writeLocalConfig(stack.llm!)
    })
    try {
      step("chat locally")
      await first.waitFor("Esc Quit", 60_000)
      await model(async () => {
        await first.submit("Remember: my cat is called Biscuit. Reply with only: ok")
        await first.waitFor(/\bok\b/i, 90_000)
      })
      await quitTui(first)
    } finally {
      await first.stop()
    }

    step("kaja sessions lists it")
    const sessions = await startTui(stack, await newPage("sessions"), ["sessions"], { fresh: false })
    try {
      const screen = await sessions.waitFor(/biscuit|cat/i, 30_000)
      if (!screen) throw new Error("The session list is empty")
      await sessions.waitForExit()
    } finally {
      await sessions.stop()
    }

    step("-c continues the conversation")
    const again = await startTui(stack, await newPage("continued"), ["--local", "-c"], { fresh: false })
    try {
      await again.waitFor("Esc Quit", 60_000)
      // The resumed chat shows the old messages, "Biscuit" among them: the answer is one more
      const count = (screen: string) => (screen.match(/biscuit/gi) ?? []).length
      const before = count(await again.screen())
      await model(async () => {
        await again.submit("What is my cat called? Reply with only the name, lowercase.")
        for (const deadline = Date.now() + 90_000; count(await again.screen()) <= before + 0; await Bun.sleep(500)) {
          if (Date.now() > deadline) throw new Error("No answer naming the cat appeared")
        }
      })
      await quitTui(again)
    } finally {
      await again.stop()
    }
  },
  { llm: true }
)
