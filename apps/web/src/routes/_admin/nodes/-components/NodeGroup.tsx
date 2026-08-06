import { cn } from "@kaja/shared"

export function NodeGroup({
  title,
  className,
  children
}: Readonly<{
  title: string
  className?: string
  children: React.ReactNode
}>) {
  return (
    <section className="mb-8">
      <h2 className="m-0 mb-4 font-mono text-[#6e7681] text-xs uppercase tracking-wider">{title}</h2>
      <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3", className)}>{children}</div>
    </section>
  )
}
