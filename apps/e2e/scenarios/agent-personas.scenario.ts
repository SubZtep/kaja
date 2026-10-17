import { signUp } from "../src/api"
import { scenario } from "../src/scenario"

type Persona = { id: string; label: string }

export default scenario(
  "Agent: personas are listed and a turn can pick one",
  async ({ stack, newEmail, step }) => {
    const user = await signUp(stack, newEmail())

    step("the catalog fills from the marketplace")
    // The API syncs it from GitHub in the background after it starts
    let personas: Persona[] = []
    for (const deadline = Date.now() + 90_000; Date.now() < deadline; await Bun.sleep(2000)) {
      personas = (await user.json<{ personas: Persona[] }>("GET", "/nasi/personas")).personas
      if (personas.some(persona => persona.id === "barkochba")) break
    }
    for (const id of ["default", "barkochba"]) {
      if (!personas.some(persona => persona.id === id))
        throw new Error(`No ${id} persona in ${JSON.stringify(personas)}`)
    }

    step("info names the starting persona and the model")
    const info = await user.json<{ persona: Persona; model: string; tools: string[] }>("GET", "/nasi/info")
    if (info.persona.id !== "default") throw new Error(`Started as ${info.persona.id}`)
    if (!info.model) throw new Error("No model in /nasi/info")

    step("a turn with a persona pins the session to it")
    const turn = await user.turn({ message: "Hi! Start the game.", personaId: "barkochba" })
    // The game asks the player something, which ends the turn as needs_input
    if (turn.status !== "completed" && turn.status !== "needs_input") throw new Error(`Turn ended ${turn.status}`)
    const listed = (await user.sessions()).find(session => session.id === turn.session)
    if (listed?.persona !== "barkochba") throw new Error(`The session's persona is ${listed?.persona}`)
  },
  { llm: true, video: false }
)
