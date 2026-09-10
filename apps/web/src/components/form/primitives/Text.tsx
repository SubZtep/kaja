import { Input as BaseInput } from "@base-ui/react/input"
import { cn } from "@kaja/shared"
import { type ComponentProps, useEffect, useState } from "react"

const VARIANTS = {
  "3d": "w-full rounded-lg border border-border/50 bg-surface px-3 py-2 text-base text-fg focus:outline-2 focus:-outline-offset-1 focus:outline-neon/50",
  simple: "rounded border border-border/50 bg-surface px-1 font-normal text-muted"
} as const

export function Text({
  variant,
  className,
  ...props
}: Readonly<{ variant?: keyof typeof VARIANTS; className?: string } & ComponentProps<"input">>) {
  return <BaseInput className={cn(variant && VARIANTS[variant], "dark:scheme-dark", className)} {...props} />
}

export function DebouncedText({
  value: initialValue,
  debounce = 500,
  onChange,
  ...props
}: Readonly<
  { debounce?: number; onChange: (value: string | number) => void; value: string | number } & Omit<
    ComponentProps<typeof Text>,
    "value" | "onChange"
  >
>) {
  const [value, setValue] = useState<string | number>(initialValue)

  // Resyncs when the caller changes `value` from outside (e.g. a "clear filters" action) —
  // otherwise this input would keep showing stale text even after the real value changed.
  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  useEffect(() => {
    const timeout = setTimeout(() => {
      onChange?.(value)
    }, debounce)

    return () => clearTimeout(timeout)
  }, [value])

  return <Text onChange={event => setValue(event.target.value)} {...props} />
}
