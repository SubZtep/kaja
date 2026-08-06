import { cn } from "@kaja/shared"
import { Link } from "@tanstack/react-router"

export function BrandMark({
  to = "/",
  className
}: Readonly<{
  to?: string
  className?: string
}>) {
  return (
    <Link to={to} className={cn("font-mono font-bold text-fg", className)}>
      <span className="text-neon">&gt;</span> kaja
    </Link>
  )
}
