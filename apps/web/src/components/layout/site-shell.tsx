import type { ReactNode } from "react"
import { cn } from "../../lib/cn"
import { Footer } from "../../routes/_public/-components/footer"
import { GritDefs } from "../../routes/_public/-components/grit-defs"
import { Header } from "../../routes/_public/-components/header"

/** Shared full-page column used by public and private route trees. */
export function SiteShell({
  children,
  className
}: Readonly<{
  children: ReactNode
  className?: string
}>) {
  return (
    <div className={cn("public-grit bg-bg font-body text-muted flex min-h-screen flex-col leading-normal", className)}>
      <GritDefs />
      <Header />
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
    </div>
  )
}
