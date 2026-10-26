import type { ModelTask } from "@kaja/schema/config"
import { LOCALE_LABELS } from "@kaja/shared/locale"
import { capitalized } from "@kaja/shared/text"
import { Box, Text } from "ink"
import { createContext, useContext } from "react"
import { t } from "../../lib/i18n"
import { KeyHint, LABEL_WIDTH, padLabel, RailLine, textWidth } from "../elem/rail"
import { Monster, monsterWidth } from "../layout/monster"
import { useKajaTheme } from "../theme"
import {
  type Block,
  BLOCK_LABEL_KEY,
  catalogChoices,
  chosenPicks,
  CUSTOM,
  EXTRA_LABEL_KEY,
  EXTRA_SHORT_KEY,
  HOOK_STEPS,
  keyState,
  providerName,
  selectedTasks,
  type Step,
  TASK_LABEL_KEY,
  THEME_LABEL_KEY,
  THEME_SHORT_KEY,
  type WizardResult,
  type WizardSaved
} from "./steps"

/** False on the first question, where Esc cancels instead, so its hint offers no "back" */
export const CanGoBack = createContext(true)

/**
 * A wizard question's hint: its keys, then "Esc back", then `note`; the first question says it can all change later
 * instead of Esc.
 */
export function WizardHint({ keys, note }: Readonly<{ keys: [key: string, action: string][]; note?: string }>) {
  const canGoBack = useContext(CanGoBack)
  if (!canGoBack) return <KeyHint keys={keys} note={note ?? t("wizard.themeHint")} />
  return <KeyHint keys={[...keys, ["Esc", t("wizard.back")]]} note={note} />
}

/** A key step's hint: Enter saves, and how the key is handled. */
export function keyHint() {
  return <WizardHint keys={[["Enter", t("hint.save")]]} note={t("wizard.keyNote")} />
}

/** One answered step, kept on screen above the next question. */
type Answer = { id: string; label: string; value: string }

type AnswerLine = Pick<Answer, "label" | "value"> | undefined
type AnswerLineFn = (subject: string, result: WizardResult, saved?: WizardSaved) => AnswerLine

// A key step's line: never the key itself, only what became of it.
function keyLine(label: string, typed: string | undefined, alreadySaved: boolean | undefined): AnswerLine {
  const value = keyState(typed, alreadySaved)
  return value ? { label, value } : undefined
}

// A key read from the environment: the variable's name, never its value.
function envLine(id: string, name: string, result: WizardResult): AnswerLine {
  const env = result.keyEnv?.[id]
  return env
    ? { label: t("wizard.summaryKeyProvider", { provider: name }), value: t("wizard.keyStateEnv", { env }) }
    : undefined
}

// A line only when there is a value to show.
function lineIf(label: string, value: string | undefined): AnswerLine {
  return value ? { label, value } : undefined
}

const ANSWER_LINES: Record<string, AnswerLineFn> = {
  language: (_, result) => lineIf(t("wizard.summaryLanguage"), result.language && LOCALE_LABELS[result.language]),
  theme: (_, result) => lineIf(t("wizard.summaryTheme"), result.theme && t(THEME_LABEL_KEY[result.theme])),
  mode: (_, result) =>
    lineIf(
      t("wizard.summaryMode"),
      result.mode && t(result.mode === "cloud" ? "wizard.modeCloudShort" : "wizard.modeLocalShort")
    ),
  providers: (_, result) => ({
    label: t("wizard.summaryProvider"),
    value: (result.providers ?? []).map(id => providerName(id, result)).join(", ")
  }),
  key: (subject, result, saved) =>
    envLine(subject, providerName(subject), result) ??
    keyLine(
      t("wizard.summaryKeyProvider", { provider: providerName(subject) }),
      result.keys?.[subject],
      saved?.providers?.includes(subject)
    ),
  address: (subject, result) =>
    lineIf(t("wizard.summaryAddress", { provider: providerName(subject) }), result.addresses?.[subject]),
  tasks: (_, result) =>
    lineIf(
      t("wizard.summaryTasks"),
      selectedTasks(result)
        .map(task => t(TASK_LABEL_KEY[task]))
        .join(", ")
    ),
  model: (subject, result) => {
    const task = subject as ModelTask
    const picked = chosenPicks(result)[task]
    return lineIf(
      capitalized(t("wizard.summaryModel", { task: t(TASK_LABEL_KEY[task]) })),
      picked && `${providerName(picked.provider, result)} (${picked.model})`
    )
  },
  "custom-name": (_, result) => lineIf(t("wizard.summaryCustom"), result.custom?.name),
  "custom-url": (_, result) =>
    lineIf(t("wizard.summaryAddress", { provider: result.custom?.name ?? "" }), result.custom?.baseUrl),
  "custom-key": (_, result, saved) => {
    const id = result.custom?.name ?? ""
    return (
      envLine(id, id, result) ??
      keyLine(t("wizard.summaryKeyProvider", { provider: id }), result.keys?.[id], saved?.providers?.includes(id))
    )
  },
  "custom-review": (_, result) =>
    lineIf(t("wizard.summaryCustomModels"), t("wizard.customModelsKept", { count: result.custom?.models.length ?? 0 })),
  "custom-task": (subject, result) => {
    const entry = result.custom?.models[Number(subject)]
    return lineIf(t("wizard.summaryCustomModel"), entry?.task && `${entry.model} (${t(TASK_LABEL_KEY[entry.task])})`)
  },
  extras: (_, result) =>
    lineIf(
      t("wizard.summaryExtras"),
      result.extras?.length ? result.extras.map(e => t(EXTRA_LABEL_KEY[e])).join(", ") : undefined
    ),
  telegramToken: (_, result, saved) => keyLine(t("wizard.summaryKeyTelegram"), result.telegramToken, saved?.telegram),
  marketplace: (_, result) =>
    lineIf(t("wizard.summaryMarketplace"), t(result.marketplace === false ? "hooks.no" : "hooks.yes")),
  autoFetch: (_, result) =>
    lineIf(t("wizard.summaryAutoFetch"), t(result.autoFetch === false ? "hooks.no" : "hooks.yes")),
  ...Object.fromEntries(
    HOOK_STEPS.map(hook => [
      hook.step,
      (_: string, result: WizardResult) =>
        lineIf(t(hook.label), t((result.hooks?.[hook.step] ?? hook.on) ? "hooks.yes" : "hooks.no"))
    ])
  )
}

/**
 * The line a finished step leaves behind. Never a key's value, only what became of it. A step that recorded nothing (no
 * extras ticked) leaves no line.
 */
export function answerLine(step: Step, result: WizardResult, saved?: WizardSaved): AnswerLine {
  const [kind, subject = ""] = step.split(":") as [string, string | undefined]
  return ANSWER_LINES[kind]?.(subject, result, saved)
}

/** Each finished block's short answers, for its folded line: no labels, the shortest form of each answer */
export const FOLDS: Record<Block, (result: WizardResult, asked: Set<string>, saved?: WizardSaved) => string[]> = {
  basics: (result, asked) => [
    ...(asked.has("language") && result.language ? [LOCALE_LABELS[result.language]] : []),
    ...(asked.has("theme") && result.theme ? [t(THEME_SHORT_KEY[result.theme])] : []),
    ...(asked.has("mode") && result.mode
      ? [t(result.mode === "cloud" ? "wizard.modeCloudShort" : "wizard.modeLocalShort")]
      : [])
  ],
  providers: (result, _, saved) => {
    const names = (result.providers ?? []).map(id =>
      id === CUSTOM && result.custom?.name ? result.custom.name : providerName(id, result)
    )
    const ids = [
      ...catalogChoices(result)
        .filter(p => p.kind === "hosted")
        .map(p => p.id),
      result.custom?.name ?? ""
    ]
    // Enter on a key already saved keeps it
    const kept = (id: string) => result.keys?.[id] === "" && saved?.providers?.includes(id)
    const set = ids.filter(id => result.keys?.[id] || result.keyEnv?.[id] || kept(id)).length
    const skipped = ids.filter(id => result.keys?.[id] === "" && !kept(id)).length
    return [
      names.join(", "),
      ...(set > 0 ? [t("wizard.foldKeysSet", { count: set })] : []),
      ...(skipped > 0 ? [t("wizard.foldKeysSkipped", { count: skipped })] : [])
    ].filter(Boolean)
  },
  models: result =>
    Object.entries(chosenPicks(result)).map(
      ([task, pick]) => `${capitalized(t(TASK_LABEL_KEY[task as ModelTask]))} ${pick.model.split("/").at(-1)}`
    ),
  extras: (result, asked, saved) => {
    const on = [
      ...(result.extras ?? []).map(extra =>
        // A bot without a token can't start, which is worth saying
        extra === "telegram" && result.telegramToken === "" && !saved?.telegram
          ? t("wizard.foldNoToken", { name: t(EXTRA_SHORT_KEY[extra]) })
          : t(EXTRA_SHORT_KEY[extra])
      ),
      ...(asked.has("marketplace")
        ? [
            result.marketplace === false
              ? t("wizard.foldOff", { name: t("wizard.summaryMarketplace") })
              : t("wizard.summaryMarketplace")
          ]
        : []),
      ...(asked.has("autoFetch") && result.autoFetch !== false ? [t("wizard.summaryAutoFetch")] : [])
    ]
    return on.length > 0 ? on : [t("wizard.foldNothing")]
  },
  sounds: (result, asked) =>
    HOOK_STEPS.filter(hook => asked.has(hook.step)).map(hook =>
      (result.hooks?.[hook.step] ?? hook.on) ? t(hook.label) : t("wizard.foldOff", { name: t(hook.label) })
    )
}

/** `parts` joined by " · " within `width` columns: the ones that don't fit are counted as "+N", never cut mid-word. */
function fitParts(parts: string[], width: number): string {
  for (let kept = parts.length; kept > 0; kept--) {
    const dropped = parts.length - kept
    const text = [...parts.slice(0, kept), ...(dropped > 0 ? [`+${dropped}`] : [])].join(" · ")
    if (Bun.stringWidth(text) <= width) return text
  }
  return parts.length > 0 ? `+${parts.length}` : ""
}

/**
 * Where the wizard is: the monster, then each block, done ones ticked and the open one with its question count. The
 * monster goes when it doesn't fit.
 */
export function Progress({
  blocks,
  current,
  at,
  of
}: Readonly<{ blocks: Block[]; current?: Block; at: number; of: number }>) {
  const { success, accent } = useKajaTheme()
  const reached = current ? blocks.indexOf(current) : blocks.length
  const count = t("wizard.progressCount", { at, of })
  const crumbs = blocks
    .map(
      (block, index) =>
        (index < reached ? "✓ " : "") + t(BLOCK_LABEL_KEY[block]) + (index === reached ? ` ${count}` : "")
    )
    .join(" › ")
  const room = textWidth() + 1
  // The monster smiles once every block is done
  const showMonster = monsterWidth(true) + 3 + Bun.stringWidth(crumbs) <= room
  return (
    <Box paddingLeft={1} width={room + 1}>
      <Text wrap="truncate-end">
        {showMonster ? (
          <Text>
            <Monster wand mood={current ? undefined : "worked"} />
            {"   "}
          </Text>
        ) : null}
        {blocks.map((block, index) => (
          <Text key={block}>
            {index > 0 ? <Text dimColor> › </Text> : null}
            {index < reached ? (
              <Text>
                <Text {...success()}>✓</Text> {t(BLOCK_LABEL_KEY[block])}
              </Text>
            ) : null}
            {index === reached ? (
              <Text>
                <Text bold {...accent()}>
                  {t(BLOCK_LABEL_KEY[block])}
                </Text>{" "}
                <Text dimColor>{count}</Text>
              </Text>
            ) : null}
            {index > reached ? <Text dimColor>{t(BLOCK_LABEL_KEY[block])}</Text> : null}
          </Text>
        ))}
      </Text>
    </Box>
  )
}

/**
 * A model id as the list shows it: Fireworks' "accounts/<org>/" (and "models/") prefix says nothing the provider column
 * doesn't.
 */
export function modelLabel(model: string): string {
  return model.replace(/^accounts\/[^/]+\/(models\/)?/, "")
}

/** The keys of a list you pick one from, then `note`. */
export function pickHint(note?: string) {
  return (
    <WizardHint
      keys={[
        ["↑↓", t("hint.move")],
        ["Enter", t("hint.pick")]
      ]}
      note={note}
    />
  )
}

/** The keys of a checklist, then `note`. */
export function tickHint(note?: string) {
  return (
    <WizardHint
      keys={[
        ["Space", t("hint.tick")],
        ["Enter", t("hint.continue")]
      ]}
      note={note}
    />
  )
}

/** How many answers the open block shows; older ones are counted on a line above them. */
export const OPEN_BLOCK_LINES = 4

/** A finished block folded into one line: "✓", its name to the value column, then its short answers, dim. */
export function FoldedBlock({ block, parts }: Readonly<{ block: Block; parts: string[] }>) {
  const { success } = useKajaTheme()
  return (
    <RailLine marker={<Text {...success()}>✓</Text>}>
      <Text wrap="truncate-end">
        {padLabel(t(BLOCK_LABEL_KEY[block]))}
        <Text dimColor>{fitParts(parts, textWidth() - LABEL_WIDTH)}</Text>
      </Text>
    </RailLine>
  )
}
