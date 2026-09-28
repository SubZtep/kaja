import { AlertDialog } from "@base-ui/react/alert-dialog"
import { Dialog } from "@base-ui/react/dialog"
import { cn } from "@kaja/shared/ui"
import type { ReactNode } from "react"

/** A dialog's title, in the site's display type. */
export const DIALOG_TITLE = "m-0 mb-1 font-display font-extrabold text-fg text-lg"

const BACKDROP =
  "fixed inset-0 z-60 min-h-dvh bg-black opacity-70 transition-all duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute"

const POPUP =
  "fixed top-1/2 left-1/2 z-60 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 text-fg outline-none transition-all duration-150 data-ending-style:scale-90 data-ending-style:opacity-0 data-starting-style:scale-90 data-starting-style:opacity-0"

/**
 * Backdrop and popup of every modal, as the site's paper card: the popup only positions and animates, the
 * frame is its child (paper-card positions itself relative), and the content scrolls inside the frame so its
 * offset shadow isn't clipped. `kind="alert"` for an AlertDialog; `className` sizes it (e.g. `w-[36rem]`).
 * Render it inside the dialog's Portal.
 */
export function DialogShell({
  kind = "dialog",
  className,
  children
}: Readonly<{ kind?: "dialog" | "alert"; className?: string; children: ReactNode }>) {
  const Backdrop = kind === "alert" ? AlertDialog.Backdrop : Dialog.Backdrop
  const Popup = kind === "alert" ? AlertDialog.Popup : Dialog.Popup
  return (
    <>
      <Backdrop className={BACKDROP} />
      <Popup className={cn(POPUP, "w-[30rem]", className)}>
        <div className="paper-card">
          <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto p-6">{children}</div>
        </div>
      </Popup>
    </>
  )
}
