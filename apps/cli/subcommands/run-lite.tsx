import { render } from "ink"
import LiteApp from "../components/layout/lite-app"

/** Renders LiteApp and waits for the Ink app to exit. Kept out of cli.lite.ts (a .ts file) since it's the only piece that needs JSX. */
export async function runLiteApp(apiUrl: string, token: string) {
  const { waitUntilExit } = render(<LiteApp apiUrl={apiUrl} token={token} />, {
    alternateScreen: true,
    kittyKeyboard: {
      mode: "auto",
      flags: ["disambiguateEscapeCodes"]
    }
  })
  await waitUntilExit()
}
