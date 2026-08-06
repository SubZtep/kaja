import { Select } from "@inkjs/ui"
import { Box, useInput } from "ink"

/**
 * Keyboard-driven selection list: up/down to move, return to pick, escape
 * (or backspace/delete) to dismiss. Wraps @inkjs/ui's Select, which has no
 * escape/cancel handling of its own, so dismissal is wired up here to keep
 * the same contract the old hand-rolled Menu had.
 */
export function SelectMenu({
  items,
  width = 32,
  onSelect,
  onClose
}: Readonly<{
  items: string[]
  width?: number
  onSelect: (index: number) => void
  onClose: () => void
}>) {
  useInput((_input, key) => {
    if (key.escape || key.backspace || key.delete) {
      onClose()
    }
  })

  return (
    <Box borderStyle="round" width={width} borderColor="blue" borderDimColor>
      <Select
        visibleOptionCount={Math.min(items.length, 5)}
        options={items.map((item, index) => ({ label: item, value: String(index) }))}
        onChange={value => onSelect(Number(value))}
      />
    </Box>
  )
}
