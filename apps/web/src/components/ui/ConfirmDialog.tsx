import { AlertDialog } from "@base-ui/react/alert-dialog"
import { cn } from "@kaja/shared/ui"
import { useId, useState } from "react"
import { m } from "../../paraglide/messages.js"
import { Button } from "../form/primitives/Button"
import { Text } from "../form/primitives/Text"

interface Props {
  title: string
  description?: string
  cancel?: string
  confirm?: string
  confirmClassName?: string
  /** Confirming needs this text typed first (e.g. the account's email before deleting it). */
  typeToConfirm?: string
  onConfirm: () => void
  children: React.ReactElement
}

export function ConfirmDialog({
  title,
  description = m.confirm_dialog_description(),
  cancel = m.confirm_dialog_cancel(),
  confirm = m.confirm_dialog_confirm(),
  confirmClassName,
  typeToConfirm,
  onConfirm,
  children
}: Readonly<Props>) {
  const inputId = useId()
  const [typed, setTyped] = useState("")
  const locked = typeToConfirm !== undefined && typed.trim().toLowerCase() !== typeToConfirm.toLowerCase()

  return (
    <AlertDialog.Root onOpenChange={open => open || setTyped("")}>
      <AlertDialog.Trigger render={children} />
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 min-h-dvh bg-black transition-all duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 opacity-70 supports-[-webkit-touch-callout:none]:absolute" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 -mt-8 w-96 max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 text-fg outline-none transition-all duration-150 data-ending-style:scale-90 data-ending-style:opacity-0 data-starting-style:scale-90 data-starting-style:opacity-0">
          <AlertDialog.Title className="-mt-1.5 mb-1 font-bold text-fg text-lg">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mb-6 text-base text-muted">{description}</AlertDialog.Description>
          {typeToConfirm === undefined ? null : (
            <div className="-mt-2 mb-6 flex flex-col gap-1.5">
              <label htmlFor={inputId} className="break-all text-muted text-sm">
                {m.confirm_dialog_type_to_confirm({ text: typeToConfirm })}
              </label>
              <Text
                id={inputId}
                variant="3d"
                value={typed}
                onChange={e => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />
            </div>
          )}
          <div className="flex justify-end gap-4">
            <AlertDialog.Close render={<Button />}>{cancel}</AlertDialog.Close>
            <AlertDialog.Close
              onClick={onConfirm}
              render={
                <Button
                  className={cn("text-red-400 font-semibold", confirmClassName)}
                  autoFocus={typeToConfirm === undefined}
                  disabled={locked}
                />
              }
            >
              {confirm}
            </AlertDialog.Close>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
