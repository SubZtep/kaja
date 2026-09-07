import { cn } from "@kaja/shared"

const TONES = {
  ice: "bg-ice/10 text-ice",
  muted: "bg-surface/60 text-muted"
} as const

export function Badge({
  tone = "muted",
  children
}: Readonly<{
  tone?: keyof typeof TONES
  children: React.ReactNode
}>) {
  return <span className={cn("rounded-md px-2.5 py-1 font-mono text-xs", TONES[tone])}>{children}</span>
}
