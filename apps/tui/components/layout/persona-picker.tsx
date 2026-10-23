import { t } from "../../lib/i18n"
import { Modal } from "../elem/modal"
import { SelectMenu } from "../elem/select-menu"

/**
 * Persona picker, a {@link Modal} opened by a hotkey. Works the same for local (rich `Persona[]`) and cloud
 * (`{id,label}[]` catalog from `/nasi/info`) — only `id`/`label` are needed for the list itself. Your own personas
 * (`local`, local mode only) are shown in the accent colour.
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
    <Modal title={t("persona.pickerTitle")} onClose={onCancel}>
      <SelectMenu
        items={personas.map(p => `${p.label}${p.id === currentPersonaId ? " ✓" : ""}`)}
        accented={personas.map(p => Boolean(p.local))}
        onSelect={index => {
          const next = personas[index]
          if (next) onSelect(next)
        }}
      />
    </Modal>
  )
}
