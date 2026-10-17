import { signUp } from "../src/api"
import { queryDb } from "../src/db"
import { scenario } from "../src/scenario"

export default scenario(
  "Sandbox: the browser ability asks before navigating, and honours approve and decline",
  async ({ stack, newEmail, model, step }) => {
    const user = await signUp(stack, newEmail())

    // Answers every approval request the same way until the turn moves on; returns the last turn and how many it answered
    const drive = async (message: string, answer: "approve" | "decline") => {
      let turn = await user.turn({ message })
      let asked = 0
      while (turn.status === "needs_approval" && asked < 6) {
        asked++
        turn = await user.turn({ session: turn.session, approval: answer })
      }
      return { turn, asked }
    }
    const approvals = (session: string) =>
      queryDb<{ name: string; approval: string }>(
        stack,
        `SELECT c.name, c.approval FROM nasi_tool_call c JOIN nasi_message m ON m.id = c.message_id WHERE m.session_id = $1 AND c.approval IS NOT NULL`,
        [session]
      )

    step("approving: the page is opened and read")
    await model(async () => {
      const { turn, asked } = await drive(
        "Use your browser to open https://example.com and tell me the page's main heading, nothing else.",
        "approve"
      )
      if (asked === 0) throw new Error(`The browser never asked for approval. Reply: ${turn.message}`)
      if (!/example domain/i.test(turn.message)) throw new Error(`Unexpected reply: ${turn.message}`)
      const recorded = await approvals(turn.session)
      if (!recorded.some(row => row.approval === "approved"))
        throw new Error(`No approval recorded: ${JSON.stringify(recorded)}`)
    })

    step("declining: nothing is run, and the refusal is recorded")
    await model(async () => {
      const { turn, asked } = await drive(
        "Use your browser to open https://example.org and tell me the page's main heading, nothing else.",
        "decline"
      )
      if (asked === 0) throw new Error(`The browser never asked for approval. Reply: ${turn.message}`)
      const recorded = await approvals(turn.session)
      if (recorded.some(row => row.approval === "approved"))
        throw new Error(`A declined call ran: ${JSON.stringify(recorded)}`)
      if (!recorded.some(row => row.approval === "declined"))
        throw new Error(`No refusal recorded: ${JSON.stringify(recorded)}`)
    })
  },
  { llm: true, sandbox: true, video: false }
)
