import { ThemeProvider } from "@inkjs/ui"
import type { ModelTask } from "@kaja/schema/config"
import { baseLocale, LOCALE_LABELS, locales } from "@kaja/shared/locale"
import { capitalized } from "@kaja/shared/text"
import { Box, Text } from "ink"
import { useEffect, useRef, useState } from "react"
import type { KajaMode } from "../../lib/config/mode"
import { setLanguage, t } from "../../lib/i18n"
import { candidatesByTask, CATALOG, type CatalogProvider, catalogProvider, TASK_ORDER } from "../../lib/models/catalog"
import { sameAddress } from "../../lib/models/detect"
import type { ThemeName } from "../../lib/terminal-background"
import { CheckMenu } from "../elem/check-menu"
import { Question, RailLine, RecentAnswer } from "../elem/rail"
import { SelectMenu } from "../elem/select-menu"
import { emote } from "../layout/monster"
import { InputPrompt, type LiveCheck, Problem } from "../secret-prompt"
import { themeFor, useKajaTheme } from "../theme"
import {
  availableTasks,
  BLOCK_ORDER,
  blockOf,
  chosenPicks,
  chosenProviders,
  CUSTOM,
  customId,
  envGuess,
  EXTRA_CHOICES,
  EXTRA_LABEL_KEY,
  HOOK_STEPS,
  type HookPrograms,
  isWebAddress,
  keyPlaceholder,
  MODE_CHOICES,
  nextStepAfter,
  type ProbeTarget,
  providerGroups,
  providerName,
  selectedTasks,
  type Step,
  stepsFor,
  TASK_LABEL_KEY,
  THEME_CHOICES,
  THEME_LABEL_KEY,
  without,
  type WizardCustom,
  type WizardExtra,
  type WizardResult,
  type WizardSaved
} from "./steps"
import {
  answerLine,
  CanGoBack,
  FoldedBlock,
  FOLDS,
  keyHint,
  modelLabel,
  OPEN_BLOCK_LINES,
  pickHint,
  Progress,
  tickHint,
  WizardHint
} from "./trail"

/**
 * The setup wizard, for both the first run (no config yet) and a re-run via `kaja config wizard`. Every step opens on
 * the current value, so holding Enter walks a configured machine through unchanged, and the last answer finishes it
 * with no confirmation. The questions are grouped in blocks; finished ones fold into a line each. Escape goes back one
 * question (on the first it cancels); Backspace/Delete don't, unlike other {@link SelectMenu}s, since a typo-fixing
 * reflex shouldn't throw an answer away. Nothing is written here: the caller applies the collected {@link WizardResult}
 * once `onDone` fires.
 */
export function ConfigWizard({
  prefill,
  mode,
  saved,
  listModels,
  probe,
  hookPrograms,
  gitReady,
  configDir,
  env = process.env,
  onDone,
  onCancel
}: Readonly<{
  prefill?: WizardResult
  /** Mode already forced by `--cloud`/`--local`; the mode step is skipped when set. */
  mode?: KajaMode
  /** Secrets already on disk, so their step offers to keep them instead of demanding a new one. */
  saved?: WizardSaved
  /**
   * The model ids the custom provider's server lists, offered instead of typing one. `key` is the one just typed,
   * if any. Without it, or when the server lists none, model ids are typed.
   */
  listModels?: (baseUrl: string, provider: string, key?: string) => Promise<string[]>
  /** Tests a typed answer once typing pauses; the wizard does no I/O itself. Without it, nothing is tested live. */
  probe?: (target: ProbeTarget, signal: AbortSignal) => Promise<LiveCheck | undefined>
  /** The sound player, notifier and speech program found here; each one found is asked about. */
  hookPrograms?: HookPrograms
  /** Git works here, so the marketplace can be fetched: only then is it asked about. */
  gitReady?: boolean
  /** Where the answers are saved, as the closing line names it (`~/.config/kaja`). */
  configDir?: string
  /** Where a provider's API key may already be set; the process's environment unless a test passes its own. */
  env?: Record<string, string | undefined>
  onDone: (result: WizardResult) => void
  onCancel: () => void
}>) {
  const initial: WizardResult = { ...prefill, ...(mode ? { mode } : {}) }
  // Language is always first and never skipped: every question after it is only answerable by
  // someone who can read it.
  const [step, setStep] = useState<Step>("language")
  const [result, setResult] = useState<WizardResult>(initial)
  // The steps answered so far, in order: the trail is drawn from them, and Esc steps back through them
  const [history, setHistory] = useState<Step[]>([])
  // Set when Enter was pressed on a checklist missing what it needs: no provider, or no chat task.
  const [refused, setRefused] = useState(false)
  // The theme the wizard is drawn in: follows the highlight on the theme step, so moving it recolours everything at once
  const [preview, setPreview] = useState<ThemeName>(initial.theme ?? "dark")
  // The custom server's model ids, per address; `ids` is unset while it is being asked
  const [listing, setListing] = useState<{ url: string; ids?: string[] }>()
  // The user chose to type a model id rather than pick a listed one
  const [typing, setTyping] = useState(false)
  // Rows a long list shows: set each render from the terminal's height, before the step is drawn
  let listRows = 8

  // Asks the custom server for its models once its address and key are in, on the first model step
  const probeUrl = step.startsWith("custom-model") ? result.custom?.baseUrl : undefined
  const probedUrl = useRef<string>(undefined)
  useEffect(() => {
    if (!probeUrl || !listModels || probedUrl.current === probeUrl) return
    probedUrl.current = probeUrl
    setListing({ url: probeUrl })
    const name = result.custom?.name ?? ""
    void listModels(probeUrl, name, result.keys?.[name] || undefined).then(ids => {
      if (probedUrl.current === probeUrl) setListing({ url: probeUrl, ids })
    })
  }, [probeUrl, listModels, result.custom?.name, result.keys])

  // The last answer finishes it: every answer is already on screen, and there's no step to go back to.
  const finished = useRef(false)
  useEffect(() => {
    if (step !== "done" || finished.current) return
    finished.current = true
    onDone(result)
  }, [step, result, onDone])

  function advance(patch: Partial<WizardResult>) {
    const next = { ...result, ...patch }
    emote("worked")
    setHistory(list => [...list, step])
    setResult(next)
    setTyping(false)
    setStep(nextStepAfter(step, next, mode, hookPrograms, gitReady))
  }

  // Enter on a checklist missing what it needs: the hint says why
  function refuse(missing: boolean) {
    setRefused(missing)
    if (missing) emote("problem")
  }

  // Esc: the previous question opens again on its answer; on the first one it cancels the wizard.
  function back() {
    const previous = history.at(-1)
    if (!previous) return onCancel()
    emote("asking")
    setHistory(list => list.slice(0, -1))
    setTyping(false)
    setRefused(false)
    // The step that ended the custom model list is asked again, so the list isn't finished any more.
    if (previous.startsWith("custom-model")) {
      setResult(current =>
        current.custom?.done ? { ...current, custom: { ...current.custom, done: false } } : current
      )
    }
    setStep(previous)
  }

  /**
   * A key step for a provider whose key is already in one of `envNames`: use it from there, copy it into secrets.toml,
   * or type another. Undefined when none of them is set, or the user chose to type.
   */
  function envKeyView(id: string, name: string, envNames: string[]) {
    const envName = envNames.find(candidate => env[candidate])
    if (!envName || typing) return undefined
    const choices = [
      t("wizard.keyFromEnv", { env: envName }),
      t("wizard.keyCopyEnv", { env: envName }),
      t("wizard.keyTypeOther")
    ]
    let current = 0
    if (result.keys?.[id]) current = result.keys[id] === env[envName] ? 1 : 2
    return (
      <Question
        title={t("wizard.keyEnvTitle", { provider: name, env: envName })}
        hint={pickHint(t("wizard.keyEnvHint"))}
      >
        <SelectMenu
          closeOnBackspace={false}
          items={choices}
          width={70}
          initialIndex={current}
          onSelect={choice => {
            if (choice === 2) return setTyping(true)
            if (choice === 0)
              return advance({ keyEnv: { ...result.keyEnv, [id]: envName }, keys: without(result.keys, id) })
            advance({ keys: { ...result.keys, [id]: env[envName]! }, keyEnv: without(result.keyEnv, id) })
          }}
          onClose={back}
        />
      </Question>
    )
  }

  // A yes/no question, "yes" first, opening on the current answer
  function yesNo({
    title,
    items,
    hint = "",
    on,
    onPick
  }: {
    title: string
    items: [string, string]
    hint?: string
    on: boolean
    onPick: (on: boolean) => void
  }) {
    return (
      <Question title={title} hint={pickHint()}>
        <SelectMenu
          closeOnBackspace={false}
          items={items}
          hints={[hint, ""]}
          width={70}
          initialIndex={on ? 0 : 1}
          onSelect={index => onPick(index === 0)}
          onClose={back}
        />
      </Question>
    )
  }

  // The `check` an InputPrompt gets for `target`, or none without a probe; the monster looks on and frowns at a refusal
  function checkWith(target: (value: string) => ProbeTarget) {
    if (!probe) return undefined
    return async (value: string, signal: AbortSignal) => {
      emote("checking")
      const verdict = await probe(target(value), signal)
      if (verdict?.tone === "bad" && !signal.aborted) emote("problem")
      return verdict
    }
  }

  function stepView() {
    const [kind, subject] = step.split(":") as [string, string | undefined]
    return providerStepView(kind, subject) ?? customStepView(kind, subject) ?? fixedStepView()
  }

  // A catalog provider's key and address, and the model picked for a task.
  function providerStepView(kind: string, subject: string | undefined) {
    const provider = subject ? catalogProvider(subject) : undefined

    if (kind === "key" && provider) {
      const fromEnv = envKeyView(provider.id, provider.name, provider.env ?? [])
      if (fromEnv) return fromEnv
      return (
        <InputPrompt
          onBack={back}
          secret
          title={t("wizard.providerKeyTitle", { provider: provider.name })}
          hint={keyHint()}
          placeholder={keyPlaceholder(
            result.keys?.[provider.id],
            saved?.providers?.includes(provider.id),
            saved?.tails?.[provider.id]
          )}
          check={checkWith(key => ({ kind: "key", baseUrl: result.addresses?.[provider.id] ?? provider.baseUrl, key }))}
          onSubmit={value =>
            advance({
              keys: { ...result.keys, [provider.id]: value || result.keys?.[provider.id] || "" },
              keyEnv: without(result.keyEnv, provider.id)
            })
          }
        />
      )
    }

    if (kind === "address" && provider) {
      return (
        <InputPrompt
          onBack={back}
          title={t("wizard.baseUrlTitle", { provider: provider.name })}
          hint={<WizardHint keys={[["Enter", t("hint.save")]]} note={t("wizard.baseUrlHint")} />}
          defaultValue={result.addresses?.[provider.id] ?? provider.baseUrl}
          check={checkWith(baseUrl => ({ kind: "address", baseUrl }))}
          onSubmit={value => advance({ addresses: { ...result.addresses, [provider.id]: value || provider.baseUrl } })}
        />
      )
    }

    if (kind === "model") {
      const task = subject as ModelTask
      const candidates = candidatesByTask(chosenProviders(result))[task] ?? []
      // Opens on the model in use, else the best guess (vision guesses the chat pick when it can see)
      const guess = chosenPicks(result)[task]
      const current = candidates.findIndex(c => c.provider === guess?.provider && c.model === guess.model)
      // The row it opens on says why: the model already in use, or the best guess
      const openTag = t(result.models?.[task] ? "wizard.modelInUse" : "wizard.modelBestGuess")
      return (
        <Question
          title={t("wizard.modelTitle", { task: t(TASK_LABEL_KEY[task]) })}
          hint={pickHint(t("wizard.modelHint"))}
        >
          <SelectMenu
            closeOnBackspace={false}
            filterable
            visibleCount={listRows}
            items={candidates.map(candidate => modelLabel(candidate.model))}
            columns={candidates.map(candidate => [providerName(candidate.provider, result)])}
            tags={candidates.map((_, index) => (index === Math.max(current, 0) ? openTag : undefined))}
            width={70}
            initialIndex={Math.max(current, 0)}
            onSelect={index => {
              const chosen = candidates[index]!
              advance({ models: { ...result.models, [task]: { provider: chosen.provider, model: chosen.model } } })
            }}
            onClose={back}
          />
        </Question>
      )
    }

    return undefined
  }

  // The custom OpenAI-compatible provider: its name, address, key, and each model with its task.
  function customStepView(kind: string, subject: string | undefined) {
    const custom = result.custom ?? { models: [] }
    const nameOf = custom.name ?? ""

    if (step === "custom-name") {
      return (
        <InputPrompt
          onBack={back}
          title={t("wizard.customNameTitle")}
          hint={<WizardHint keys={[["Enter", t("hint.save")]]} note={t("wizard.customNameHint")} />}
          defaultValue={custom.name}
          validate={value => (customId(value) ? undefined : t("wizard.customNameInvalid"))}
          onSubmit={value => advance({ custom: { ...custom, name: customId(value) } })}
        />
      )
    }

    if (step === "custom-url") {
      return (
        <InputPrompt
          onBack={back}
          title={t("wizard.customUrlTitle")}
          hint={<WizardHint keys={[["Enter", t("hint.save")]]} note={t("wizard.customUrlHint")} />}
          defaultValue={custom.baseUrl}
          validate={value => (isWebAddress(value) ? undefined : t("wizard.customUrlInvalid"))}
          check={checkWith(baseUrl => ({ kind: "address", baseUrl }))}
          onSubmit={value => advance({ custom: { ...custom, baseUrl: value } })}
        />
      )
    }

    if (step === "custom-key") {
      const fromEnv = envKeyView(nameOf, nameOf, [envGuess(nameOf)])
      if (fromEnv) return fromEnv
      return (
        <InputPrompt
          onBack={back}
          secret
          title={t("wizard.providerKeyTitle", { provider: nameOf })}
          hint={keyHint()}
          placeholder={keyPlaceholder(
            result.keys?.[nameOf],
            saved?.providers?.includes(nameOf),
            saved?.tails?.[nameOf]
          )}
          check={checkWith(key => ({ kind: "key", baseUrl: custom.baseUrl ?? "", key }))}
          onSubmit={value =>
            advance({
              keys: { ...result.keys, [nameOf]: value || result.keys?.[nameOf] || "" },
              keyEnv: without(result.keyEnv, nameOf)
            })
          }
        />
      )
    }

    if (step === "custom-review") {
      const ADD = "add"
      return (
        <Question
          title={t("wizard.customReviewTitle", { provider: nameOf })}
          hint={tickHint(t("wizard.customReviewHint"))}
        >
          <CheckMenu
            filterable
            visibleCount={listRows}
            options={[
              ...custom.models.map((entry, index) => ({
                label: entry.task ? `${entry.model} (${t(TASK_LABEL_KEY[entry.task])})` : entry.model,
                value: String(index)
              })),
              { label: t("wizard.customAddModel"), value: ADD }
            ]}
            defaultValue={custom.models.map((_, index) => String(index))}
            onSubmit={values => {
              const models = custom.models.filter((_, index) => values.includes(String(index)))
              advance({ custom: { ...custom, models, reviewed: models.length, done: !values.includes(ADD) } })
            }}
            onClose={back}
          />
        </Question>
      )
    }

    if (kind === "custom-model") return customModelView(Number(subject), custom, nameOf)

    if (kind === "custom-task") {
      const index = Number(subject)
      const entry = custom.models[index]
      return (
        <Question title={t("wizard.customTaskTitle", { model: entry?.model ?? "" })} hint={pickHint()}>
          <SelectMenu
            closeOnBackspace={false}
            items={TASK_ORDER.map(task => t(TASK_LABEL_KEY[task]))}
            width={70}
            initialIndex={entry?.task ? TASK_ORDER.indexOf(entry.task) : undefined}
            onSelect={choice =>
              advance({
                custom: {
                  ...custom,
                  models: custom.models.map((m, i) => (i === index ? { ...m, task: TASK_ORDER[choice]! } : m))
                }
              })
            }
            onClose={back}
          />
        </Question>
      )
    }

    return undefined
  }

  // One custom model: picked from what the server lists, else typed; empty ends the list.
  function customModelView(index: number, custom: WizardCustom, nameOf: string) {
    // A model the wizard is re-offering opens on its id; one past the end is a new one, and empty ends the list.
    const existing = custom.models[index]
    const listed = listing?.url === custom.baseUrl ? listing : undefined
    if (!existing && !typing && listed && !listed.ids) {
      return <Text dimColor>{t("wizard.customModelSearching", { url: custom.baseUrl ?? "" })}</Text>
    }
    const offered = (listed?.ids ?? []).filter(id => !custom.models.some(entry => entry.model === id))
    if (!existing && !typing && offered.length > 0) {
      // Typing and finishing first, so they stay in reach above a long list
      const actions = [t("wizard.customModelTypeOther"), ...(index > 0 ? [t("wizard.customModelEnough")] : [])]
      return (
        <Question
          title={t(index === 0 ? "wizard.customModelPickTitle" : "wizard.customModelPickMoreTitle", {
            provider: nameOf
          })}
          hint={pickHint()}
        >
          <SelectMenu
            closeOnBackspace={false}
            items={[...actions, ...offered]}
            width={70}
            initialIndex={actions.length}
            onSelect={choice => {
              if (choice === 0) return setTyping(true)
              if (choice < actions.length) return advance({ custom: { ...custom, done: true } })
              advance({
                custom: { ...custom, models: [...custom.models, { model: offered[choice - actions.length]! }] }
              })
            }}
            onClose={back}
          />
        </Question>
      )
    }
    return (
      <InputPrompt
        onBack={back}
        title={t(index === 0 || existing ? "wizard.customModelTitle" : "wizard.customModelMoreTitle", {
          provider: nameOf
        })}
        hint={<WizardHint keys={[["Enter", t("hint.save")]]} note={t("wizard.customModelHint")} />}
        defaultValue={existing?.model}
        // The first model is required, or the provider would serve nothing.
        validate={value => (!existing && index === 0 && !value ? t("wizard.customModelRequired") : undefined)}
        onSubmit={value => {
          if (existing) {
            const models = custom.models.map((m, i) => (i === index && value ? { ...m, model: value } : m))
            return advance({ custom: { ...custom, models } })
          }
          advance({
            custom: value ? { ...custom, models: [...custom.models, { model: value }] } : { ...custom, done: true }
          })
        }}
      />
    )
  }

  // The steps asked once: language, theme, mode, providers, extras and the Telegram token.
  function fixedStepView() {
    switch (step) {
      case "mode": {
        return (
          <Question title={t("wizard.modeTitle")} hint={pickHint()}>
            <SelectMenu
              closeOnBackspace={false}
              items={[t("wizard.modeCloud"), t("wizard.modeLocal")]}
              width={70}
              initialIndex={Math.max(0, MODE_CHOICES.indexOf(result.mode ?? "cloud"))}
              onSelect={index => advance({ mode: MODE_CHOICES[index] })}
              onClose={back}
            />
          </Question>
        )
      }

      case "language": {
        return (
          <Question title={t("wizard.languageTitle")} hint={pickHint()}>
            <SelectMenu
              closeOnBackspace={false}
              items={locales.map(locale => LOCALE_LABELS[locale])}
              initialIndex={locales.indexOf(result.language ?? baseLocale)}
              onSelect={index => {
                const language = locales[index]!
                // Switching the process language here is the whole point of asking first: every step
                // after this one renders through `t()`. The caller still saves it to preferences.locale.
                setLanguage(language)
                advance({ language })
              }}
              onClose={back}
            />
          </Question>
        )
      }

      case "theme": {
        return (
          <Question title={t("wizard.themeTitle")} hint={pickHint()}>
            <SelectMenu
              closeOnBackspace={false}
              items={THEME_CHOICES.map(choice => t(THEME_LABEL_KEY[choice]))}
              width={70}
              initialIndex={THEME_CHOICES.indexOf(result.theme ?? "dark")}
              // The highlighted row in that theme's own colours, and the whole wizard with it
              preview
              onFocus={index => setPreview(THEME_CHOICES[index]!)}
              onSelect={index => advance({ theme: THEME_CHOICES[index] })}
              onClose={back}
            />
          </Question>
        )
      }

      case "providers": {
        // Servers running here and what you already use or have a key for, the well-known ones, then the rest by name
        const envKey = (provider: CatalogProvider) => provider.env?.find(name => env[name])
        const inUse = (provider: CatalogProvider) => Boolean(result.providers?.includes(provider.id))
        // A catalog entry for a server found running here (LM Studio) gives way to the server's own model list
        const local = result.local ?? []
        const sameServer = (provider: CatalogProvider) =>
          local.some(server => sameAddress(server.baseUrl, provider.baseUrl))
        const listed = CATALOG.filter(provider => !sameServer(provider))
        const groups = providerGroups(listed, provider => inUse(provider) || Boolean(envKey(provider)))
        const kind = (provider: CatalogProvider) =>
          t(provider.kind === "hosted" ? "wizard.kindCloud" : "wizard.kindLocal")
        const row = (provider: CatalogProvider, group: string, reason?: string) => ({
          label: provider.name,
          value: provider.id,
          group,
          detail: [kind(provider), ...(reason ? [reason] : [])]
        })
        const foundGroup = t("wizard.groupFound")
        const restGroup = t("wizard.groupRest")
        return (
          <Question
            title={t("wizard.providerTitle")}
            hint={refused ? <Problem>{t("wizard.providerRequired")}</Problem> : tickHint()}
          >
            {/* A re-run starts with the providers in models.toml ticked; a first run with those whose key is in the environment and the servers running here. */}
            <CheckMenu
              filterable
              enterPicksFocused
              visibleCount={listRows}
              options={[
                ...local.map(server => ({
                  label: server.name,
                  value: server.id,
                  group: foundGroup,
                  detail: [
                    t("wizard.kindLocal"),
                    t("wizard.foundRunning", { address: server.baseUrl.replace(/^https?:\/\//, "") })
                  ]
                })),
                ...groups.found.map(provider => {
                  const variable = envKey(provider)
                  return row(
                    provider,
                    foundGroup,
                    variable ? t("wizard.foundEnv", { env: variable }) : t("wizard.foundInUse")
                  )
                }),
                ...groups.popular.map(provider => row(provider, t("wizard.groupPopular"))),
                {
                  label: t("wizard.providerCustom"),
                  value: CUSTOM,
                  group: restGroup,
                  detail: [t("wizard.providerCustomDetail")]
                },
                ...groups.rest.map(provider => row(provider, restGroup))
              ]}
              defaultValue={
                result.providers ?? [
                  ...local.map(server => server.id),
                  ...listed.filter(envKey).map(provider => provider.id)
                ]
              }
              onSubmit={providers => {
                refuse(providers.length === 0)
                if (providers.length > 0) advance({ providers })
              }}
              onClose={back}
            />
          </Question>
        )
      }

      case "tasks": {
        const available = availableTasks(result)
        return (
          <Question
            title={t("wizard.tasksTitle")}
            hint={
              refused ? (
                <Problem>{t(available.includes("chat") ? "wizard.tasksChatRequired" : "wizard.tasksNoChat")}</Problem>
              ) : (
                tickHint(t("wizard.tasksHint"))
              )
            }
          >
            <CheckMenu
              options={available.map(task => ({ label: capitalized(t(TASK_LABEL_KEY[task])), value: task }))}
              defaultValue={selectedTasks(result)}
              onSubmit={values => {
                // Local mode can't start without something to chat with
                const missingChat = !values.includes("chat")
                refuse(missingChat)
                if (!missingChat) advance({ tasks: values as ModelTask[] })
              }}
              onClose={back}
            />
          </Question>
        )
      }

      case "extras": {
        return (
          <Question title={t("wizard.extrasTitle")} hint={tickHint(t("wizard.extrasHint"))}>
            {/* Nothing ticked by default, so one Enter skips the whole step. */}
            <CheckMenu
              options={EXTRA_CHOICES.map(extra => ({ label: t(EXTRA_LABEL_KEY[extra]), value: extra }))}
              defaultValue={result.extras}
              onSubmit={values => advance({ extras: values as WizardExtra[] })}
              onClose={back}
            />
          </Question>
        )
      }

      case "telegramToken": {
        return (
          <InputPrompt
            onBack={back}
            secret
            title={t("wizard.telegramTokenTitle")}
            hint={keyHint()}
            placeholder={keyPlaceholder(result.telegramToken, saved?.telegram, saved?.tails?.telegram)}
            check={checkWith(token => ({ kind: "telegram", token }))}
            onSubmit={value => advance({ telegramToken: value || result.telegramToken || "" })}
          />
        )
      }

      case "marketplace": {
        return yesNo({
          title: t("wizard.marketplaceTitle"),
          items: [t("wizard.marketplaceYes"), t("wizard.marketplaceNo")],
          on: result.marketplace !== false,
          onPick: marketplace => advance({ marketplace })
        })
      }

      case "autoFetch": {
        return yesNo({
          title: t("wizard.autoFetchTitle"),
          items: [t("wizard.autoFetchYes"), t("wizard.autoFetchNo")],
          on: result.autoFetch !== false,
          onPick: autoFetch => advance({ autoFetch })
        })
      }

      case "sounds":
      case "notifications":
      case "speech": {
        const hook = HOOK_STEPS.find(candidate => candidate.step === step)!
        const program = hookPrograms?.[hook.kind] ?? ""
        return yesNo({
          title: t(hook.title, { program }),
          items: [t("hooks.yes"), t("hooks.no")],
          // Speech names its program in the question already
          hint: hook.step === "speech" ? "" : program,
          on: result.hooks?.[hook.step] ?? hook.on,
          onPick: on => advance({ hooks: { ...result.hooks, [hook.step]: on } })
        })
      }

      default:
        // Nothing to draw: the answers are on screen, and the setup carries on below once onDone fires.
        return null
    }
  }

  const { success } = useKajaTheme()
  const steps = stepsFor(result, mode, hookPrograms, gitReady)
  const blocks = BLOCK_ORDER.filter(block => steps.some(candidate => blockOf(candidate) === block))
  const current = blockOf(step)
  const inBlock = steps.filter(candidate => blockOf(candidate) === current)
  // The open step is missing from the list only while it ends the custom model list: it's then that list's last one.
  const at = Math.max(inBlock.indexOf(step), 0) + 1
  const of = Math.max(inBlock.length, at)
  // Each answered step's line, latest answers shown, so going back and changing one updates it
  const trail = history.flatMap(answeredStep => {
    const line = answerLine(answeredStep, result, saved)
    const block = blockOf(answeredStep)
    return line && block ? [{ id: answeredStep, block, ...line }] : []
  })
  const asked = new Set(history.map(answeredStep => answeredStep.split(":")[0]!))
  const recent = trail.filter(line => line.block === current)
  // The latest few only: a frame taller than the terminal can't be redrawn in place
  const hidden = Math.max(0, recent.length - OPEN_BLOCK_LINES)
  const folded = blocks.filter(block => block !== current && trail.some(line => line.block === block))
  // A list gets what the terminal has left after everything else on screen, 5 to 10 rows
  const around =
    2 +
    (folded.length > 0 ? folded.length + 1 : 0) +
    Math.min(recent.length, OPEN_BLOCK_LINES) +
    (hidden > 0 ? 1 : 0) +
    10
  listRows = Math.min(10, Math.max(5, (process.stdout.rows || 24) - around))

  return (
    <ThemeProvider theme={themeFor(preview)}>
      <Box flexDirection="column">
        {/* Blank lines keep the header off the shell prompt and set the folded blocks and the open block apart */}
        <Box marginY={1}>
          <Progress blocks={blocks} current={current} at={at} of={of} />
        </Box>
        {folded.length > 0 ? (
          <Box flexDirection="column" marginBottom={1}>
            {blocks.map(block =>
              folded.includes(block) ? (
                <FoldedBlock key={block} block={block} parts={FOLDS[block](result, asked, saved)} />
              ) : null
            )}
          </Box>
        ) : null}
        {hidden > 0 ? (
          <RailLine marker={<Text dimColor>⋮</Text>}>
            <Text dimColor>{t("wizard.moreAnswers", { count: hidden })}</Text>
          </RailLine>
        ) : null}
        {recent.slice(hidden).map(line => (
          <RecentAnswer key={line.id} label={line.label} value={line.value} />
        ))}
        {/* The last frame closes the record of what was chosen; the runner's Finishing up follows below it */}
        {current ? null : (
          <RailLine marker={<Text {...success()}>✓</Text>}>
            <Text>
              <Text bold>{t("wizard.allSet")}</Text>
              {configDir ? <Text dimColor> {t("wizard.savedTo", { path: configDir })}</Text> : null}
            </Text>
          </RailLine>
        )}
        {/* The rail runs from the recent answers into the question */}
        {recent.length > 0 && current ? (
          <RailLine marker={<Text dimColor>│</Text>}>
            <Text> </Text>
          </RailLine>
        ) : null}
        {/* Keyed by step: two questions of one kind in a row (two addresses, two keys) must not share an input's state. */}
        <Box key={step} flexDirection="column">
          <CanGoBack value={history.length > 0}>{stepView()}</CanGoBack>
        </Box>
      </Box>
    </ThemeProvider>
  )
}
