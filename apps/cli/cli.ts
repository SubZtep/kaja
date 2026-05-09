import { apiBaseUrl } from "./lib/clients"
import * as auth from "./ui/auth"
import * as init from "./ui/init"

process.env.API_URL = apiBaseUrl

void (async () => {
  const helperResult = await init.helperCommands()
  if (helperResult.handled) {
    process.exit(helperResult.exitCode)
  }
  await init.printLogo()
  await auth.authFlow()
  process.exit(0)
})().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[kaja] ${message}`)
  process.exit(1)
})
