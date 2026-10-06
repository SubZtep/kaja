import { cn } from "@kaja/shared/ui"

export function StatusDot({ active, label }: Readonly<{ active: boolean; label: string }>) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("size-1.5 rounded-full", active ? "bg-neon" : "bg-surface-2")} />
      <span className="text-muted text-xs">{label}</span>
    </div>
  )
}
