import { signUp } from "../src/api"
import { scenario } from "../src/scenario"

export default scenario(
  "Sandbox: it registers, fetch_url goes out through it, and private addresses are refused",
  async ({ stack, newEmail, model, step }) => {
    const user = await signUp(stack, newEmail())

    step("the sandbox is listed as online")
    const listed = await user.json<{ online: number }>("GET", "/sandbox/public")
    if (listed.online < 1) throw new Error(`No online sandbox in /sandbox/public: ${JSON.stringify(listed)}`)

    step("fetch_url reads a public page through the sandbox")
    await model(async () => {
      const turn = await user.turn({
        message: "Use your fetch_url tool on https://example.com and tell me the page's main heading, nothing else."
      })
      if (!turn.steps.some(s => s.type === "tool_call" && s.name === "fetch_url"))
        throw new Error(`fetch_url wasn't called. Steps: ${JSON.stringify(turn.steps).slice(0, 600)}`)
      if (!/example domain/i.test(turn.message)) throw new Error(`Unexpected reply: ${turn.message}`)
    })

    step("a private address is refused by the egress")
    await model(async () => {
      const refused = await user.turn({
        message: `Use fetch_url on ${stack.apiUrl}/health and quote exactly the error or text the tool returned.`
      })
      if (!refused.steps.some(s => s.type === "tool_call" && s.name === "fetch_url"))
        throw new Error(`fetch_url wasn't called. Reply: ${refused.message}`)
      // The tool's own error is what the model quotes; a served page would say "status"
      if (!/non-public/i.test(refused.message))
        throw new Error(`The private fetch wasn't refused. Reply: ${refused.message}`)
    })
  },
  { llm: true, sandbox: true, video: false }
)
