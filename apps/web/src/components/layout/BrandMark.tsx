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
    <Link
      to={to}
      className={cn("font-display font-extrabold text-fg flex gap-2 items-center tracking-tight", className)}
    >
      {monster ? (
        <img
          src="/monster.gif"
          alt={m.brand_monster_alt()}
          width={324}
          height={108}
          className="h-7 w-auto opacity-90 hidden sm:block"
        />
      ) : (
        <span className="text-neon">&gt;</span>
      )}
      kaja
    </Link>
  )
}
