import { cn } from "@kaja/shared"
import type { CSSProperties, ReactNode } from "react"

const TONES = {
  ice: "",
  neon: "sticker-neon",
  ink: "sticker-ink",
  ghost: "sticker-ghost"
} as const

/** CSS sticker: real type, rotated, hard shadow. Not an image. */
export function Sticker({
  children,
  tone = "ice",
  rotate = -2,
  className
}: Readonly<{
  children: ReactNode
  tone?: keyof typeof TONES
  rotate?: number
  className?: string
}>) {
  return (
    <span
      className={cn("sticker sticker-wiggle", TONES[tone], className)}
      style={{ "--sticker-rot": `${rotate}deg` } as CSSProperties}
    >
      {children}
    </span>
  )
}
