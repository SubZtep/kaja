import { AlertDialog } from "@base-ui/react/alert-dialog"
import { useId, useState } from "react"
import { cn } from "../../lib/cn"
import { m } from "../../paraglide/messages.js"
import { Button } from "../form/primitives/button"
import { Text } from "../form/primitives/text"
import { DIALOG_TITLE, DialogShell } from "./dialog-shell"

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
        <DialogShell kind="alert" className="-mt-8 w-96">
          <AlertDialog.Title className={DIALOG_TITLE}>{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-muted mb-6 text-base">{description}</AlertDialog.Description>
          {typeToConfirm === undefined ? null : (
            <div className="-mt-2 mb-6 flex flex-col gap-1.5">
              <label htmlFor={inputId} className="text-muted text-sm break-all">
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
          <div className="flex flex-wrap justify-end gap-3">
            <AlertDialog.Close render={<Button className="whitespace-nowrap" />}>{cancel}</AlertDialog.Close>
            <AlertDialog.Close
              onClick={onConfirm}
              render={
                <Button
                  className={cn("font-semibold whitespace-nowrap text-red-400", confirmClassName)}
                  autoFocus={typeToConfirm === undefined}
                  disabled={locked}
                />
              }
            >
              {confirm}
            </AlertDialog.Close>
          </div>
        </DialogShell>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
