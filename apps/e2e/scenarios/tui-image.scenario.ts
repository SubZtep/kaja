import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { e2eDir, e2eEnv } from "../src/env"
import { quitTui } from "../src/flows-tui"
import { Skip, scenario } from "../src/scenario"
import { startTui, writeLocalConfig } from "../src/tui"
import { pollUntil } from "../src/wait"

/** Every file under `dir`, with its size. */
function filesUnder(dir: string): { path: string; bytes: number }[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const path = join(dir, entry.name)
      return entry.isDirectory() ? filesUnder(path) : [{ path, bytes: statSync(path).size }]
    })
  } catch {
    return []
  }
}

export default scenario(
  "TUI --local: a generated image is shown and kept, with its description",
  async ({ stack, newPage, model, step }) => {
    if (!e2eEnv.E2E_IMAGE_API_KEY) throw new Skip("set E2E_IMAGE_API_KEY (an xAI key) in apps/e2e/.env")
    if (!stack.llm) throw new Error("This scenario needs a model")
    const tui = await startTui(stack, await newPage("local"), ["--local"], {
      config: () => writeLocalConfig(stack.llm!)
    })
    try {
      await tui.waitFor("Esc Quit", 60_000)

      step("ask for an image")
      await model(async () => {
        await tui.submit("Use your image generation tool to draw a simple red apple on a white background.")
        await tui.waitFor("open", 150_000)
      })

      step("the image is kept as a file, with its description")
      const store = join(e2eDir, e2eEnv.E2E_OUT_DIR, "tui-home", "data", "kaja-e2e", "files")
      const files = await pollUntil(
        () => filesUnder(store),
        found => found.some(file => file.path.endsWith(".json")),
        { timeoutMs: 60_000, intervalMs: 1000 }
      )
      const images = files.filter(file => !file.path.endsWith(".json"))
      if (images.length === 0) throw new Error(`No image kept under ${store}: ${JSON.stringify(files)}`)
      if (!files.some(file => file.path.endsWith(".json"))) throw new Error("The image has no description beside it")
      const picture = new Bun.Image(await Bun.file(images[0]!.path).bytes())
      const { width, height } = await picture.metadata()
      if (width < 64 || height < 64) throw new Error(`The kept image is only ${width}×${height}`)

      await quitTui(tui)
    } finally {
      await tui.stop()
    }
  },
  { llm: true }
)
