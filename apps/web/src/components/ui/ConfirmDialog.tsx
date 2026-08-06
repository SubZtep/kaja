import { AlertDialog } from "@base-ui/react/alert-dialog"
import { cn } from "@kaja/shared"
import { Button } from "../form/primitives/Button"

interface Props {
  title: string
  description?: string
  cancel?: string
  confirm?: string
  confirmClassName?: string
  onConfirm: () => void
  children: React.ReactElement
}

export function ConfirmDialog({
  title,
  description = "You can’t undo this action.",
  cancel = "Cancel",
  confirm = "Confirm",
  confirmClassName,
  onConfirm,
  children
}: Readonly<Props>) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger render={children} />
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 min-h-dvh bg-black transition-all duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 opacity-70 supports-[-webkit-touch-callout:none]:absolute" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 -mt-8 w-96 max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 text-fg outline-none transition-all duration-150 data-ending-style:scale-90 data-ending-style:opacity-0 data-starting-style:scale-90 data-starting-style:opacity-0">
          <AlertDialog.Title className="-mt-1.5 mb-1 font-bold text-fg text-lg">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mb-6 text-base text-muted">{description}</AlertDialog.Description>
          <div className="flex justify-end gap-4">
            <AlertDialog.Close render={<Button />}>{cancel}</AlertDialog.Close>
            <AlertDialog.Close
              onClick={onConfirm}
              render={<Button className={cn("text-red-400 font-semibold", confirmClassName)} autoFocus />}
            >
              {confirm}
            </AlertDialog.Close>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
