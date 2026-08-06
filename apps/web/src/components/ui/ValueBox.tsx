import { cn } from "@kaja/shared"

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
    <div
      className={cn(
        "min-w-28 rounded-xl border border-border border-t-2 bg-surface px-4 py-3.5 sm:min-w-36",
        variant === "neon" ? "border-t-neon" : "border-t-ice"
      )}
    >
      <p className="mb-1 font-mono text-[#6e7681] text-[11px] uppercase tracking-wider">{label}</p>
      <p className={cn("font-mono font-semibold text-2xl", variant === "neon" ? "text-neon" : "text-ice")}>
        {children}
      </p>
    </div>
  )
}
