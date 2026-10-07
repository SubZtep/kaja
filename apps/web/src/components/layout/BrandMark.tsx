import { cn } from "@kaja/shared/ui"
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
      className={cn("flex items-center gap-2 font-display font-extrabold text-fg tracking-tight", className)}
    >
      {monster ? (
        // Usually the page's first monster.gif, so React's SSR preload of it takes this priority (it's the hero's LCP image too); fades back while the hero's big monster is on screen
        <img
          src="/monster.gif"
          alt={m.brand_monster_alt()}
          width={324}
          height={108}
          fetchPriority="high"
          className="hidden h-7 w-auto in-data-hero-monster:opacity-25 opacity-90 in-data-hero-monster:blur-[1px] in-data-hero-monster:grayscale transition-[opacity,filter] duration-500 sm:block"
        />
      ) : (
        <span className="text-neon">&gt;</span>
      )}
      kaja
    </Link>
  )
}
