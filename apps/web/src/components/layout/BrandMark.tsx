import { cn } from "@kaja/shared"
import { Link } from "@tanstack/react-router"
import { m } from "../../paraglide/messages.js"

export function BrandMark({
  to = "/",
  monster,
  className
}: Readonly<{
  to?: string
  monster?: boolean
  className?: string
}>) {
  return (
    <Link to={to} className={cn("font-mono font-bold text-fg flex gap-2 items-center", className)}>
      {monster ? (
        <img src="monster.gif" alt={m.brand_monster_alt()} className="h-7 opacity-90" />
      ) : (
        <span className="text-neon">&gt;</span>
      )}
      kaja
    </Link>
  )
}
