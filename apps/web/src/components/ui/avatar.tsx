import { Avatar as BaseAvatar } from "@base-ui/react/avatar"
import { cn } from "@kaja/shared/ui"

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
    <BaseAvatar.Root
      className={cn(
        "border-border bg-surface-2 flex shrink-0 items-center justify-center overflow-hidden rounded-md border",
        SIZES[size].box
      )}
    >
      {src ? <BaseAvatar.Image alt={alt} className="size-full object-cover" src={src} /> : null}
      {/* Also shown while the image loads or when its URL fails */}
      <BaseAvatar.Fallback className={cn("text-neon font-mono font-semibold", SIZES[size].text)}>
        {initials}
      </BaseAvatar.Fallback>
    </BaseAvatar.Root>
  )
}
