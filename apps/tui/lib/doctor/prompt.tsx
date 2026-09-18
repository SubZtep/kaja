import { render } from "ink"

/** Asks for a secret in the terminal; resolves to the trimmed value, or undefined when skipped. */
export async function askSecret(title: string): Promise<string | undefined> {
  const { SecretPrompt } = await import("../../components/secret-prompt")
  return new Promise(resolve => {
    const { unmount } = render(
      <SecretPrompt
        title={title}
        onSubmit={value => {
          unmount()
          resolve(value)
        }}
        onSkip={() => {
          unmount()
          resolve(undefined)
        }}
      />
    )
  })
}

/** Asks whether to keep a value that failed its test; false (don't save) is the safe default. */
export async function askSaveAnyway(title: string): Promise<boolean> {
  const { SaveAnywayPrompt } = await import("../../components/secret-prompt")
  return new Promise(resolve => {
    const { unmount } = render(
      <SaveAnywayPrompt
        title={title}
        onResolve={save => {
          unmount()
          resolve(save)
        }}
      />
    )
  })
}
