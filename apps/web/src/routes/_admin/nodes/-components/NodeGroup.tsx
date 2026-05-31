import { cn } from "@kaja/shared"

export function NodeGroup({
  title,
  className,
  children
}: {
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <h3 className="text-sm font-bold uppercase tracking-widest text-muted mb-4">{title}</h3>
      <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", className)}>{children}</div>
    </section>
  )
}
