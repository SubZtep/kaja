import { Link } from "@tanstack/react-router"
import type { NavItem } from "./nav-items"

/** The tab strip atop a grouped section (Dashboard, Agent, Admin), in the header's stamp type; scrolls sideways on a narrow screen instead of wrapping. */
export function SectionTabs({ items }: Readonly<{ items: NavItem[] }>) {
  return (
    <nav className="hide-scrollbar mb-8 flex gap-1 overflow-x-auto border-border border-b border-dashed">
      {items.map(item => (
        <Link
          key={item.to}
          to={item.to!}
          activeOptions={{ exact: item.exact ?? false }}
          className="-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 font-stamp text-[11px] uppercase tracking-[0.07em] hover:text-fg"
          activeProps={{ className: "border-neon text-fg" }}
          inactiveProps={{ className: "border-transparent text-muted" }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
