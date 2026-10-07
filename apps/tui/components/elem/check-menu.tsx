import { Box, Text, useInput } from "ink"
import { useState } from "react"
import { useKajaTheme } from "../theme"
import { InputFrame } from "./rail"

/**
 * A checklist: every row has a box, `[✔]` ticked or `[ ]` not, so it reads as "pick any" at a glance. Up/down to
 * move, space to tick or untick, return to submit the ticked values (in option order), escape to dismiss. Drawn
 * like {@link SelectMenu} rather than through @inkjs/ui's `MultiSelect`, which marks only
 * the ticked rows and so looks like a single-choice list until something is ticked.
 */
export function CheckMenu({
  options,
  defaultValue,
  width = 70,
  onSubmit,
  onClose
}: Readonly<{
  options: { label: string; value: string }[]
  /** The values ticked on open, e.g. the providers a re-run finds in use. */
  defaultValue?: string[]
  width?: number
  onSubmit: (values: string[]) => void
  onClose?: () => void
}>) {
  const [focused, setFocused] = useState(0)
  const [ticked, setTicked] = useState(() => new Set(defaultValue))

  useInput((input, key) => {
    if (key.escape) onClose?.()
    else if (key.downArrow) setFocused(index => Math.min(index + 1, options.length - 1))
    else if (key.upArrow) setFocused(index => Math.max(index - 1, 0))
    else if (input === " ") {
      const value = options[focused]!.value
      setTicked(current => {
        const next = new Set(current)
        if (!next.delete(value)) next.add(value)
        return next
      })
    } else if (key.return) onSubmit(options.filter(option => ticked.has(option.value)).map(option => option.value))
  })

  const { success } = useKajaTheme()

  return (
    // Like SelectMenu: no background and no colour change, the highlighted row is marked by "❯" and bold alone.
    <InputFrame width={width} plain>
      {options.map((option, index) => {
        const isFocused = index === focused
        const isTicked = ticked.has(option.value)
        return (
          <Box key={option.value} paddingLeft={isFocused ? 0 : 2} gap={1}>
            {isFocused && <Text bold>❯</Text>}
            {/* Only the tick is coloured: it says what's picked, the "❯" and bold say where you are. An empty box is dimmed so the ticks stand out. */}
            <Text bold={isFocused} {...(isTicked ? success() : { dimColor: !isFocused })}>
              {isTicked ? "[✔]" : "[ ]"}
            </Text>
            <Text bold={isFocused}>{option.label}</Text>
          </Box>
        )
      })}
    </InputFrame>
  )
}
