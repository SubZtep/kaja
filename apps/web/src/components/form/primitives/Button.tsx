import { Button as BaseButton } from "@base-ui/react/button"
import { cn } from "@kaja/shared"
import { LoaderCircle } from "lucide-react"

const VARIANTS = {
  "3d": "border border-border/50 bg-surface hover:bg-surface-2",
  link: "mx-auto inline-block size-fit p-0! text-neon underline hover:text-neon-hi hover:outline-0",
  oval: "rounded-full border border-border/60 text-muted hover:text-fg",
  primary: "bg-neon text-bg font-bold hover:bg-neon-hi"
} as const

const SIZES = {
  sm: "rounded-md px-2 py-1 text-sm",
  md: "rounded-lg px-3 py-2.5",
  lg: "rounded-lg px-4 py-2.5 text-lg font-semibold"
} as const

const DEFAULT_CLASSES =
  "relative flex cursor-pointer items-center justify-center transition-all duration-100 focus:outline-2 focus:outline-neon/50 disabled:pointer-events-none disabled:opacity-50 active:scale-95"

export function Button({
  variant = "3d",
  size = "md",
  type = "button",
  focusableWhenDisabled,
  className,
  onClick,
  loading,
  disabled,
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
      {...props}
    >
      {children}
      {loading && <LoaderCircle strokeWidth={3} className="absolute right-2 animate-spin text-current opacity-60" />}
    </BaseButton>
  )
}
