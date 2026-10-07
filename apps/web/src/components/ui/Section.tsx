import { cn } from "@kaja/shared/ui"
import type { CSSProperties, ReactNode } from "react"

const BORDERED = {
  always: "paper-card",
  "sm-up": "sm:paper-card sm:px-6 sm:py-6"
} as const

/** Card surface shared by landing tiles and admin panels: the site's hand-cut paper frame (`paper-card`), from `sm` up only with `bordered="sm-up"`; `tone="danger"` tints it red. Renders a div so it nests cleanly inside page sections. */
export function Section({
  className,
  style,
  children,
  padded = true,
  bordered = "always",
  tone,
  title
}: Readonly<{
  className?: string
  style?: CSSProperties
  children: ReactNode
  padded?: boolean
  bordered?: keyof typeof BORDERED
  tone?: "danger"
  title?: ReactNode
}>) {
  return (
    <div
      className={cn(
        BORDERED[bordered],
        tone === "danger" && "paper-card-danger",
        // unpadded (a table inside) still keeps the frame's edge visible
        padded ? bordered === "always" && "px-5.5 py-5 sm:p-6" : "p-0.5",
        className
      )}
      style={style}
    >
      {title && <h2 className="m-0 mb-4 font-display font-extrabold text-base text-fg">{title}</h2>}
      {children}
    </div>
  )
}
