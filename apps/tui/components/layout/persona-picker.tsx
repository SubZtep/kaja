import { Box, Text } from "ink"
import { t } from "../../lib/i18n"
import { SelectMenu } from "../elem/select-menu"

/**
 * Persona picker shown in place of the input field, opened by a hotkey.
 * Mirrors {@link ConfirmCommand}'s "swap in for UserInput" shape. Works the
 * same for local (rich `Persona[]`) and cloud (`{id,label}[]` catalog from
 * `/nasi/info`) — only `id`/`label` are needed for the list itself. Your own
 * personas (`local`, local mode only) are shown in the accent colour.
 */
export function PersonaPicker({
  personas,
  currentPersonaId,
  onSelect,
  onCancel
}: Readonly<{
  personas: { id: string; label: string; local?: boolean }[]
  currentPersonaId?: string
  onSelect: (persona: { id: string; label: string }) => void
  onCancel: () => void
}>) {
  return (
    <Box flexDirection="column" flexShrink={0} width="100%">
      <Text>{t("persona.pickerTitle")}</Text>
      <SelectMenu
        items={personas.map(p => `${p.label}${p.id === currentPersonaId ? " ✓" : ""}`)}
        accented={personas.map(p => Boolean(p.local))}
        onSelect={index => {
          const next = personas[index]
          if (next) onSelect(next)
        }}
        onClose={onCancel}
      />
    </Box>
  )
}
