import { render } from "ink"
import type { ReactNode } from "react"
import { Answered } from "../../components/elem/rail"
import { ConsoleTheme } from "../../components/theme"
import { t } from "../i18n"

/**
 * Renders one prompt on its own and resolves with its value. The answer replaces the question on screen, so the
 * scrollback keeps a one-line trail ("✓ title answer") instead of every finished prompt.
 */
function ask<T>(title: string, prompt: (settle: (value: T, answer: string) => void) => ReactNode): Promise<T> {
  return new Promise(resolve => {
    const instance = render(
      <ConsoleTheme>
        {prompt((value, answer) => {
          instance.rerender(
            <ConsoleTheme>
              <Answered label={title} value={answer} />
            </ConsoleTheme>
          )
          instance.unmount()
          resolve(value)
        })}
      </ConsoleTheme>
    )
  })
}

const skipped = () => t("wizard.keyStateSkipped")

/** Asks for a secret in the terminal; resolves to the trimmed value, or undefined when skipped. */
export async function askSecret(title: string): Promise<string | undefined> {
  const { SecretPrompt } = await import("../../components/secret-prompt")
  return ask<string | undefined>(title, settle => (
    <SecretPrompt
      title={title}
      onSubmit={value => settle(value, "••••••••")}
      onSkip={() => settle(undefined, skipped())}
    />
  ))
}

/** Asks for a non-secret value in the terminal; resolves to the trimmed value, or undefined when skipped. */
export async function askText(
  title: string,
  opts?: { hint?: string; defaultValue?: string }
): Promise<string | undefined> {
  const { TextPrompt } = await import("../../components/secret-prompt")
  return ask<string | undefined>(title, settle => (
    <TextPrompt
      title={title}
      hint={opts?.hint}
      defaultValue={opts?.defaultValue}
      onSubmit={value => settle(value, value)}
      onSkip={() => settle(undefined, skipped())}
    />
  ))
}

/** Asks a yes/no question with "no" as the default (first, and what Esc picks); `defaultYes` opens on "yes" instead. */
export async function askYesNo(
  title: string,
  yesLabel: string,
  noLabel: string,
  opts?: { defaultYes?: boolean; yesFirst?: boolean }
): Promise<boolean> {
  const { YesNoPrompt } = await import("../../components/secret-prompt")
  return ask<boolean>(title, settle => (
    <YesNoPrompt
      title={title}
      yesLabel={yesLabel}
      noLabel={noLabel}
      defaultYes={opts?.defaultYes}
      yesFirst={opts?.yesFirst}
      onResolve={yes => settle(yes, yes ? yesLabel : noLabel)}
    />
  ))
}

/** Asks to pick one of a few items; the first is the safe answer, and Esc resolves to undefined. */
export async function askPick(title: string, items: string[]): Promise<number | undefined> {
  const { PickPrompt } = await import("../../components/secret-prompt")
  return ask<number | undefined>(title, settle => (
    <PickPrompt
      title={title}
      items={items}
      onResolve={index => settle(index, index === undefined ? skipped() : items[index]!)}
    />
  ))
}

/** Asks whether to keep a value that failed its test; not saving is the default. */
export function askSaveAnyway(title: string): Promise<boolean> {
  return askYesNo(title, t("secretPrompt.saveAnyway"), t("secretPrompt.dontSave"))
}
