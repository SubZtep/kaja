import { Dialog } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { m } from "../../paraglide/messages.js"
import { Checkbox } from "../form/primitives/Checkbox"
import { DIALOG_TITLE, DialogShell } from "../ui/DialogShell"
import { SourceLink } from "./InstructionsDialog"
import { useSetDisabledTools } from "./queries"
import { abilitySourceUrl } from "./source"
import type { ToolEntry } from "./ToolCard"

/**
 * Everything an HTTP tool or MCP server ability can call: each tool's name, what it does, its method and
 * whether it asks first. While the ability is on, a checkbox per tool keeps it out of the user's chats; the
 * last one left on can't be unticked (the card's own switch turns the whole ability off).
 */
export function ToolsDialog({
  entry,
  enabled,
  disabledTools,
  open,
  onOpenChange
}: Readonly<{
  entry: ToolEntry
  enabled: boolean
  disabledTools: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}>) {
  const setDisabled = useSetDisabledTools()
  const off = new Set(disabledTools)
  const onCount = entry.items.length - entry.items.filter(item => off.has(item.name)).length

  const pick = (tool: string, on: boolean) => {
    const next = on ? disabledTools.filter(name => name !== tool) : [...disabledTools, tool]
    setDisabled.mutate({ type: entry.type, name: entry.ability.name, disabled: next })
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <DialogShell className="w-[34rem]">
          <div className="mb-2 flex items-start justify-between gap-3">
            <Dialog.Title className={DIALOG_TITLE}>{m.tools_list_title({ name: entry.ability.name })}</Dialog.Title>
            <Dialog.Close
              aria-label={m.menu_close()}
              className="-mt-1 -mr-2 shrink-0 cursor-pointer rounded-sm p-1 text-muted hover:text-fg"
            >
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-0 mb-4 text-muted text-xs">
            {enabled ? m.tools_pick_hint() : m.tools_pick_off_hint({ name: entry.ability.name })}
          </Dialog.Description>
          {entry.approvalNote && <p className="mt-0 mb-4 text-ice text-xs">{entry.approvalNote}</p>}

          <ul className="m-0 grid list-none gap-3 p-0">
            {entry.items.map(item => {
              const on = !off.has(item.name)
              return (
                <li
                  key={item.name}
                  className="flex items-start gap-3 border-border border-t border-dashed pt-3 first:border-t-0 first:pt-0"
                >
                  <Checkbox
                    className="mt-0.5 shrink-0"
                    checked={on}
                    disabled={!enabled || setDisabled.isPending || (on && onCount === 1)}
                    aria-label={m.tools_pick_toggle({ tool: item.name })}
                    onCheckedChange={checked => pick(item.name, checked)}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-mono text-fg">{item.name}</span>
                      {item.method && <span className="font-mono text-muted text-xs">{item.method}</span>}
                      {item.method && item.method !== "GET" && (
                        <span className="text-ice text-xs">{m.tools_asks_first()}</span>
                      )}
                    </div>
                    {item.description && (
                      <p className="mt-1 mb-0 whitespace-pre-line text-[13px] text-muted">{item.description}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          <SourceLink href={abilitySourceUrl(entry.type, entry.ability.name)} />
        </DialogShell>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
