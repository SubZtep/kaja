import { cn } from "@kaja/shared"

const SIZES = {
  sm: { box: "h-9 w-9", text: "text-xs" },
  lg: { box: "h-14 w-14", text: "text-xl" }
} as const

export function Avatar({
  src,
  alt,
  initials,
  size = "sm"
}: Readonly<{
  src?: string | null
  alt: string
  initials: string
  size?: keyof typeof SIZES
}>) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2",
        SIZES[size].box
      )}
    >
      {src ? (
        <img alt={alt} className="h-full w-full object-cover" src={src} />
      ) : (
        <span className={cn("font-mono font-semibold text-neon", SIZES[size].text)}>{initials}</span>
      )}
    </div>
  )
}
