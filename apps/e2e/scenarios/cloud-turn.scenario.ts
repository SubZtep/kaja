import { signUp } from "../src/api"
import { scenario } from "../src/scenario"

export default scenario(
  "Cloud: a signed-up user gets a model reply to a turn",
  async ({ stack, newEmail, model, step }) => {
    step("sign up through the API")
    const user = await signUp(stack, newEmail())

    step("ask the model for one word")
    const result = await model(async () => {
      const turn = await user.turn({ message: "Reply with exactly one word: pong" })
      if (!turn.message?.toLowerCase().includes("pong")) throw new Error(`Unexpected reply: ${turn.message}`)
      return turn
    })
    if (result.status !== "done") throw new Error(`Unexpected status ${result.status}`)
  },
  { llm: true, video: false }
)
