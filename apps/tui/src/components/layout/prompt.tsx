import type { PersonaModels } from "@kaja/schema/cli"
import { Box, Text, type TextProps } from "ink"
import { useState } from "react"
import { useKey } from "../../hooks/use-key"
import { SelectMenu } from "../elem/select-menu"
import { UserInput } from "./user-input"

/** One answer the user can pick; more kinds (multi-select, secret, path, …) join this union, each with its own view. */
type PromptOption = { kind: "choice"; id: string; label: string }

/** What a prompt asks and how it can be answered: pick an option, or write something instead. */
export type PromptSpec = {
  /** Left out where the question is already on screen, e.g. the agent's, in the chat. */
  title?: string
  /** Colours the title, e.g. the warning tone of an approval. */
  tone?: TextProps
  options: PromptOption[]
  /** Hint of the text field, saying what writing there does for this question. */
  placeholder: string
}

export type PromptResult = { kind: "option"; id: string } | { kind: "text"; text: string }

/**
 * The question in place of the chat input: its options as a list and the usual text field under it. The list has the
 * keys while the field is empty; typing anything gives the field the keys (the list dims), and clearing it, or Esc,
 * hands them back. Esc on the list dismisses the prompt, as `SelectMenu`'s `onClose`.
 *
 * `busy` replaces the options and the field with a status line, for the time the answer is being acted on.
 */
export function Prompt({
  spec,
  busy,
  asking = false,
  speaking = false,
  personaModels,
  history,
  mic,
  onMicChange,
  onDraft,
  onResolve,
  onDismiss
}: Readonly<{
  spec: PromptSpec
  busy?: string
  /** The field's border marks it as an answer to the agent's question (the power border), not a reply to a gate. */
  asking?: boolean
  speaking?: boolean
  personaModels?: PersonaModels
  /** Past prompts for the field's ↑/↓ recall. */
  history?: string[]
  /** The field's mic switch, owned by the caller so it survives this prompt coming and going. */
  mic?: boolean
  onMicChange?: (mic: boolean) => void
  /** Called with the field's text as it changes. */
  onDraft?: (draft: string) => void
  onResolve: (result: PromptResult) => void
  /** Esc on the list; left out where Esc means something else (the chat's own quit). */
  onDismiss?: () => void
}>) {
  const [draft, setDraft] = useState("")
  // Remounting is how Esc empties the field, which keeps its text to itself
  const [generation, setGeneration] = useState(0)
  const listHasKeys = draft === ""

  useKey(
    (_input, key) => {
      if (!key.escape) return
      setDraft("")
      setGeneration(n => n + 1)
    },
    { isActive: !listHasKeys && !busy }
  )

  return (
    <Box flexDirection="column" flexShrink={0} width="100%">
      {spec.title && <Text {...spec.tone}>{spec.title}</Text>}
      {busy ? (
        <Text dimColor>{busy}</Text>
      ) : (
        <>
          <SelectMenu
            items={spec.options.map(option => option.label)}
            active={listHasKeys}
            onSelect={index => onResolve({ kind: "option", id: spec.options[index]!.id })}
            onClose={onDismiss}
          />
          <UserInput
            key={generation}
            pending={false}
            speaking={speaking}
            asking={asking}
            send={text => Promise.resolve(onResolve({ kind: "text", text }))}
            personaModels={personaModels}
            history={history}
            mic={mic}
            onMicChange={onMicChange}
            placeholder={spec.placeholder}
            onDraft={text => {
              setDraft(text)
              onDraft?.(text)
            }}
          />
        </>
      )}
    </Box>
  )
}
