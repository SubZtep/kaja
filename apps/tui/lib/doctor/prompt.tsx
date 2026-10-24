import { render } from "ink"
import type { ReactNode } from "react"
import { Answered } from "../../components/elem/rail"
import { ConsoleTheme } from "../../components/theme"
import { t } from "../i18n"

/** How a prompt leaves the screen: `quiet` when the caller prints its own result line, so the question leaves nothing. */
export type AskOptions = { quiet?: boolean }

/**
 * Renders one prompt on its own and resolves with its value. The answer replaces the question on screen, so the
 * scrollback keeps a one-line trail ("✓ title answer") instead of every finished prompt, or nothing when `quiet`.
 */
function ask<T>(
  title: string,
  { quiet }: AskOptions,
  prompt: (settle: (value: T, answer: string) => void) => ReactNode
): Promise<T> {
  return new Promise(resolve => {
    const instance = render(
      <ConsoleTheme>
        {prompt((value, answer) => {
          // Erasing rather than drawing nothing: an empty frame still leaves a blank line behind
          if (quiet) instance.clear()
          else
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
export async function askSecret(title: string, opts: AskOptions = {}): Promise<string | undefined> {
  const { InputPrompt } = await import("../../components/secret-prompt")
  return ask<string | undefined>(title, opts, settle => (
    <InputPrompt
      secret
      title={title}
      onSubmit={value => settle(value, "••••••••")}
      onSkip={() => settle(undefined, skipped())}
    />
  ))
}

/** Asks a yes/no question with "no" as the default (first, and what Esc picks); `defaultYes` opens on "yes" instead. */
export async function askYesNo(
  title: string,
  yesLabel: string,
  noLabel: string,
  opts: AskOptions & { defaultYes?: boolean; yesFirst?: boolean } = {}
): Promise<boolean> {
  const { YesNoPrompt } = await import("../../components/secret-prompt")
  return ask<boolean>(title, opts, settle => (
    <YesNoPrompt
      title={title}
      yesLabel={yesLabel}
      noLabel={noLabel}
      defaultYes={opts.defaultYes}
      yesFirst={opts.yesFirst}
      onResolve={yes => settle(yes, yes ? yesLabel : noLabel)}
    />
  ))
}

/** Asks to pick one of a few items; the first is the safe answer, and Esc resolves to undefined. */
export async function askPick(title: string, items: string[], opts: AskOptions = {}): Promise<number | undefined> {
  const { PickPrompt } = await import("../../components/secret-prompt")
  return ask<number | undefined>(title, opts, settle => (
    <PickPrompt
      title={title}
      items={items}
      onResolve={index => settle(index, index === undefined ? skipped() : items[index]!)}
    />
  ))
}
