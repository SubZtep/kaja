import { cn } from "@kaja/shared"
import type { CSSProperties, ReactNode } from "react"

const BORDERED = {
  always: "border border-border",
  "sm-up": "border-0 p-0 sm:border sm:px-6 sm:py-6"
} as const

/** Card surface shared by landing tiles and admin panels. Renders a div so it nests cleanly inside page sections. */
export function Section({
  className,
  style,
  children,
  padded = true,
  bordered = "always",
  title
}: Readonly<{
  className?: string
  style?: CSSProperties
  children: ReactNode
  padded?: boolean
  bordered?: keyof typeof BORDERED
  title?: ReactNode
}>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl sm:bg-surface",
        BORDERED[bordered],
        padded && bordered === "always" && "px-5.5 py-5 sm:px-6 sm:py-6",
        className
      )}
      style={style}
    >
      {title && <h2 className="m-0 mb-4 font-semibold text-fg text-[15px]">{title}</h2>}
      {children}
    </div>
  )
}
