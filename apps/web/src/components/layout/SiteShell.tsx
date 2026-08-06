import type { ReactNode } from "react"

/** Shared full-page column used by public and private route trees. */
export function SiteShell({
  header,
  footer,
  children
}: Readonly<{
  header: ReactNode
  footer?: ReactNode
  children: ReactNode
}>) {
  return (
    <div className="flex min-h-screen flex-col bg-bg font-body leading-normal text-muted">
      {header}
      <div className="flex flex-1 flex-col">{children}</div>
      {footer}
    </div>
  )
}
