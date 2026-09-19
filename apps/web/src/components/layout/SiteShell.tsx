import { cn } from "@kaja/shared"
import type { ReactNode } from "react"

/** Shared full-page column used by public and private route trees. */
export function SiteShell({
  header,
  footer,
  children,
  className
}: Readonly<{
  header: ReactNode
  footer: ReactNode
  children: ReactNode
  className?: string
}>) {
  return (
    <div className={cn("flex min-h-screen flex-col bg-bg font-body leading-normal text-muted", className)}>
      {header}
      <main className="flex flex-1 flex-col">{children}</main>
      {footer}
    </div>
  )
}
