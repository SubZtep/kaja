import type { ElementType, ReactNode } from "react"
import { cn } from "../../lib/cn"

/** Centered page column shared by headers, footers, and section bodies. */
export function ContentWidth({
  as: Tag = "div",
  className,
  children
}: Readonly<{
  as?: ElementType
  className?: string
  children: ReactNode
}>) {
  return <Tag className={cn("mx-auto w-full max-w-280 px-4 sm:px-6", className)}>{children}</Tag>
}
