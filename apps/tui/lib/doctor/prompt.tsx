import { render } from "ink"
import { t } from "../i18n"

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

/** Asks for a non-secret value in the terminal; resolves to the trimmed value, or undefined when skipped. */
export async function askText(
  title: string,
  opts?: { hint?: string; defaultValue?: string }
): Promise<string | undefined> {
  const { TextPrompt } = await import("../../components/secret-prompt")
  return new Promise(resolve => {
    const { unmount } = render(
      <TextPrompt
        title={title}
        hint={opts?.hint}
        defaultValue={opts?.defaultValue}
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

/** Asks a yes/no question with "no" as the default (first, and what Esc picks). */
export async function askYesNo(title: string, yesLabel: string, noLabel: string): Promise<boolean> {
  const { YesNoPrompt } = await import("../../components/secret-prompt")
  return new Promise(resolve => {
    const { unmount } = render(
      <YesNoPrompt
        title={title}
        yesLabel={yesLabel}
        noLabel={noLabel}
        onResolve={yes => {
          unmount()
          resolve(yes)
        }}
      />
    )
  })
}

/** Asks whether to keep a value that failed its test; not saving is the default. */
export function askSaveAnyway(title: string): Promise<boolean> {
  return askYesNo(title, t("secretPrompt.saveAnyway"), t("secretPrompt.dontSave"))
}
