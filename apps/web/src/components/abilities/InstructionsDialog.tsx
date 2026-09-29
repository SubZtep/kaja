import { Dialog } from "@base-ui/react/dialog"
import { ExternalLink, X } from "lucide-react"
import type { ReactNode } from "react"
import { m } from "../../paraglide/messages.js"
import { DIALOG_TITLE, DialogShell } from "../ui/DialogShell"

/** An ability in full, so its card can stay short: the whole description, what the model reads (`children`), and where the source lives. */
export function InstructionsDialog({
  title,
  description,
  sourceUrl,
  open,
  onOpenChange,
  children
}: Readonly<{
  title: ReactNode
  description?: string
  sourceUrl: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}>) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <DialogShell className="w-160">
          <div className="mb-2 flex items-start justify-between gap-3">
            <Dialog.Title className={DIALOG_TITLE}>{title}</Dialog.Title>
            <Dialog.Close
              aria-label={m.menu_close()}
              className="-mt-1 -mr-2 shrink-0 cursor-pointer rounded-sm p-1 text-muted hover:text-fg"
            >
              <X size={18} />
            </Dialog.Close>
          </div>
          {description && (
            <Dialog.Description className="mt-0 mb-4 text-muted text-sm">{description}</Dialog.Description>
          )}
          {children}
          <SourceLink href={sourceUrl} />
        </DialogShell>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** "View source on GitHub", under an ability's details. */
export function SourceLink({ href }: Readonly<{ href: string }>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="mt-4 inline-flex items-center gap-1 text-muted text-xs underline-offset-2 hover:text-fg hover:underline"
    >
      <ExternalLink size={12} aria-hidden />
      {m.abilities_view_source()}
    </a>
  )
}
