import { signUp } from "../src/api"
import { scenario } from "../src/scenario"

export default scenario(
  "Agent: a remembered fact reaches a brand-new session",
  async ({ stack, newEmail, model, step }) => {
    const user = await signUp(stack, newEmail())

    step("ask it to remember something")
    await model(async () => {
      const turn = await user.turn({
        message: "Use your memory tool to remember permanently that my favourite colour is teal. Reply with only: ok"
      })
      const remembered = turn.steps.some(s => s.type === "tool_call" && String(s.name).includes("remember"))
      if (!remembered) throw new Error(`The model never wrote a note. Steps: ${JSON.stringify(turn.steps)}`)
    })

    step("a new session recalls it")
    await model(async () => {
      const turn = await user.turn({ message: "What is my favourite colour? Reply with only the colour, lowercase." })
      if (!/teal/i.test(turn.message)) throw new Error(`Unexpected reply: ${turn.message}`)
    })
  },
  { llm: true, video: false }
)
