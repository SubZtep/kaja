import { Link } from "@tanstack/react-router"
import type { NavItem } from "./nav-items"

/** The tab strip atop a grouped section (Dashboard, Agent, Admin), in the header's stamp type; scrolls sideways on a narrow screen instead of wrapping. */
export function SectionTabs({ items }: Readonly<{ items: NavItem[] }>) {
  return (
    <nav className="hide-scrollbar border-border mb-8 flex gap-1 overflow-x-auto border-b border-dashed">
      {items.map(item => (
        <Link
          key={item.to}
          to={item.to!}
          activeOptions={{ exact: item.exact ?? false }}
          className="font-stamp hover:text-fg -mb-px shrink-0 border-b-2 px-3 py-2.5 text-[11px] tracking-[0.07em] whitespace-nowrap uppercase"
          activeProps={{ className: "border-neon text-fg" }}
          inactiveProps={{ className: "border-transparent text-muted" }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
