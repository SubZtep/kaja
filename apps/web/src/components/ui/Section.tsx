import { cn } from "@kaja/shared"
import type { CSSProperties, ReactNode } from "react"

/** Card surface shared by landing tiles and admin panels. Renders a div so it nests cleanly inside page sections. */
export function Section({
  className,
  style,
  children,
  padded = true
}: Readonly<{
  className?: string
  style?: CSSProperties
  children: ReactNode
  padded?: boolean
}>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border sm:bg-surface",
        padded && "px-5.5 py-5 sm:px-6 sm:py-6",
        className
      )}
      style={style}
    >
      {children}
    </div>
  )
}
