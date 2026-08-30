import { render } from "ink"
import type { FirstRunChoice } from "../../components/first-run-setup"
import { create } from "../config/config"

/**
 * Interactively ask which provider template to start from (--local implies
 * a self-configured provider), so a new user isn't left with a template
 * pointing at a models.toml id that doesn't exist yet. Non-interactive
 * stdin (scripts, CI) can't answer a prompt, so it falls back to writing
 * the template untouched — same as before this prompt existed. No-op if a
 * config already exists.
 */
export async function runFirstRunIfNeeded() {
  if (!process.stdin.isTTY) {
    await create()
    return
  }

  const { FirstRunSetup } = await import("../../components/first-run-setup")
  const { writeModelsTemplate } = await import("../models/models")
  const choice = await new Promise<FirstRunChoice | undefined>(resolve => {
    const { unmount } = render(
      <FirstRunSetup
        onDone={c => {
          unmount()
          resolve(c)
        }}
        onCancel={() => {
          unmount()
          resolve(undefined)
        }}
      />
    )
  })
  if (!choice) process.exit(0)
  await create()
  if (choice.template) await writeModelsTemplate(choice.template)
}
