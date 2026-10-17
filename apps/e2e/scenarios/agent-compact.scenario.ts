import { signUp } from "../src/api"
import { scenario } from "../src/scenario"

export default scenario(
  "Agent: compacting a session keeps what mattered",
  async ({ stack, newEmail, model, step }) => {
    const user = await signUp(stack, newEmail())

    step("build a session with a fact and some chatter")
    const first = await user.turn({
      message: "Remember: my cat is called Biscuit. Then say one sentence about cats."
    })
    for (const message of ["Give me two short facts about the moon.", "Now two short facts about the sea."]) {
      await user.turn({ session: first.session, message })
    }

    step("compact it")
    const { compacted } = await user.compact(first.session, "keep the cat's name")
    if (!compacted) throw new Error("Nothing was compacted")
    if (compacted.afterTokens >= compacted.beforeTokens)
      throw new Error(`Compaction didn't shrink it: ${compacted.beforeTokens} → ${compacted.afterTokens}`)

    step("the session still knows the cat's name")
    await model(async () => {
      const turn = await user.turn({
        session: first.session,
        message: "What is my cat called? Reply with only the name, lowercase."
      })
      if (!/biscuit/i.test(turn.message)) throw new Error(`Unexpected reply: ${turn.message}`)
    })
  },
  { llm: true, video: false }
)
