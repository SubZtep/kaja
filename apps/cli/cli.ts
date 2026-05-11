import { updateSettings } from "@clack/prompts"
import { apiBaseUrl } from "./lib/clients"
import * as auth from "./ui/auth"
import * as init from "./ui/init"
import * as node from "./ui/node"

process.env.API_URL = apiBaseUrl

void (async () => {
  updateSettings({ withGuide: false })
  const helperResult = await init.helperCommands()
  if (helperResult.handled) {
    process.exit(helperResult.exitCode)
  }

  await init.printLogo()
  await auth.initUserSession()
  await node.doStuff()

  process.exit(0)
})().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[kaja] ${message}`)
  process.exit(1)
})
