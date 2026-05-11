import { cancel, isCancel, text } from "@clack/prompts"
import { kaja } from "../lib/clients"

/** Connect the CLI node with the API. */
export async function doStuff() {
  if (!kaja.config.id) {
    const name = await text({
      message: "What is your node’s name?",
      placeholder: kaja.config.name,
      validate: value => {
        if (!value || value.length < 2) return "Name must be at least 2 characters"
        return undefined
      }
    })

    if (isCancel(name)) {
      cancel("No name provided")
      process.exit(1)
    }

    kaja.setConfig({ name })
  }

  await kaja.connectNode()
}
