import { Button as BaseButton } from "@base-ui/react/button"
import { cn } from "@kaja/shared/ui"
import { LoaderCircle } from "lucide-react"

const VARIANTS = {
  "3d": "border border-fg/35 bg-surface-2 shadow-[2px_3px_0_var(--color-border)] not-disabled:hover:border-fg/50 not-disabled:hover:bg-border/60",
  chip: "rounded-sm! p-0! border border-border bg-surface-2 px-3! py-1.5! font-medium text-xs",
  link: "mx-auto inline-block size-fit p-0! text-neon underline not-disabled:hover:text-neon-hi not-disabled:hover:outline-0",
  oval: "rounded-full border border-border/60 text-muted not-disabled:hover:text-fg",
  primary: "bg-neon text-bg font-bold shadow-[2px_3px_0_var(--color-ice)] not-disabled:hover:bg-neon-hi",
  secondary:
    "border border-border shadow-[2px_3px_0_var(--color-border)] not-disabled:hover:border-amber-900 bg-surface text-fg font-medium"
} as const

const SIZES = {
  sm: "rounded-sm px-2 py-1 text-sm",
  md: "rounded-sm px-3 py-2.5",
  lg: "rounded-sm px-4 py-2.5 text-lg font-semibold"
} as const

const DEFAULT_CLASSES =
  "relative flex cursor-pointer items-center justify-center transition-all duration-100 focus:outline-2 focus:outline-neon/50 disabled:opacity-50 not-disabled:active:translate-x-0.5 not-disabled:active:translate-y-0.5 not-disabled:active:shadow-none"

export function Button({
  variant = "3d",
  size = "md",
  type = "button",
  focusableWhenDisabled,
  className,
  onClick,
  loading,
  disabled,
  render,
  nativeButton = !render,
  children,
  ...props
}: Readonly<
  {
    variant?: keyof typeof VARIANTS
    size?: keyof typeof SIZES
    type?: "button" | "submit"
    focusableWhenDisabled?: boolean
    className?: string
    onClick?: () => void
    loading?: boolean
    render?: React.ComponentProps<typeof BaseButton>["render"]
    nativeButton?: boolean
    children?: React.ReactNode
  } & React.ComponentProps<"button">
>) {
  return (
    <BaseButton
      type={type}
      className={cn(DEFAULT_CLASSES, size && SIZES[size], VARIANTS[variant], className)}
      focusableWhenDisabled={focusableWhenDisabled}
      disabled={loading || disabled}
      onClick={onClick}
      render={render}
      nativeButton={nativeButton}
      {...props}
    >
      {children}
      {loading && <LoaderCircle strokeWidth={3} className="absolute right-2 animate-spin text-current opacity-60" />}
    </BaseButton>
  )
}
