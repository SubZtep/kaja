import { cn } from "../../lib/cn"

/** A small paper stat card; its accent colour is a strip of tape across the top edge. */
export function ValueBox({
  label,
  variant = "ice",
  children
}: Readonly<{
  label: string
  variant?: "ice" | "neon"
  children: React.ReactNode
}>) {
  return (
    <div className="paper-card min-w-28 px-4 py-3.5 sm:min-w-36">
      <span
        aria-hidden
        className={cn(
          "absolute -top-1.5 left-4 h-2.5 w-10 -rotate-3 opacity-80",
          variant === "neon" ? "bg-neon" : "bg-ice"
        )}
      />
      <p className="text-muted mb-1 font-mono text-[11px] tracking-wider uppercase">{label}</p>
      <p className={cn("font-mono text-2xl font-semibold", variant === "neon" ? "text-neon" : "text-ice")}>
        {children}
      </p>
    </div>
  )
}
