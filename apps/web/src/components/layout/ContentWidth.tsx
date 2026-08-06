import { cn } from "@kaja/shared"
import type { ElementType, ReactNode } from "react"

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
