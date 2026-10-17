import { signUp } from "../src/api"
import { scenario } from "../src/scenario"

export default scenario(
  "Agent: a session remembers, lists, hides from others and deletes",
  async ({ stack, newEmail, model, step }) => {
    step("sign up two users")
    const alice = await signUp(stack, newEmail())
    const bob = await signUp(stack, newEmail())

    step("tell Alice's session a secret")
    const first = await alice.turn({
      message: "Remember for this chat: the secret word is pomegranate. Reply with only: ok"
    })
    if (first.status !== "completed") throw new Error(`First turn ended ${first.status}`)

    step("the follow-up turn recalls it")
    await model(async () => {
      const second = await alice.turn({
        session: first.session,
        message: "What is the secret word? Reply with only that word, lowercase."
      })
      if (second.session !== first.session) throw new Error("A follow-up turn opened a new session")
      if (!/pomegranate/i.test(second.message)) throw new Error(`Unexpected reply: ${second.message}`)
    })

    step("the session is listed for Alice only")
    if (!(await alice.sessions()).some(session => session.id === first.session)) throw new Error("Not in Alice's list")
    if ((await bob.sessions()).length !== 0) throw new Error("Bob sees a session")
    const peek = await bob.call("GET", `/nasi/sessions/${first.session}`)
    if (peek.status !== 404) throw new Error(`Bob reading Alice's session got ${peek.status}, wanted 404`)
    const meddle = await bob.call("DELETE", `/nasi/sessions/${first.session}`)
    if (meddle.status !== 404) throw new Error(`Bob deleting Alice's session got ${meddle.status}, wanted 404`)

    step("Alice deletes it")
    await alice.json("DELETE", `/nasi/sessions/${first.session}`)
    if ((await alice.call("GET", `/nasi/sessions/${first.session}`)).status !== 404) throw new Error("Still there")
    if ((await alice.sessions()).length !== 0) throw new Error("Still listed")
  },
  { llm: true, video: false }
)
