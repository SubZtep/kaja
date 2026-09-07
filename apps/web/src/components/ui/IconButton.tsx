import { Button as BaseButton } from "@base-ui/react/button"
import { cn } from "@kaja/shared"

const VARIANTS = {
  danger: "rounded-lg text-red-400 transition-all hover:bg-red-400/10",
  neutral: "rounded-md text-neon transition-colors hover:bg-neon/10"
} as const

export function IconButton({
  variant = "neutral",
  className,
  render,
  nativeButton = !render,
  children,
  ...props
}: Readonly<
  {
    variant?: keyof typeof VARIANTS
    className?: string
    render?: React.ComponentProps<typeof BaseButton>["render"]
    nativeButton?: boolean
    children?: React.ReactNode
  } & React.ComponentProps<"button">
>) {
  return (
    <BaseButton
      className={cn("inline-flex p-2", VARIANTS[variant], className)}
      render={render}
      nativeButton={nativeButton}
      {...props}
    >
      {children}
    </BaseButton>
  )
}
