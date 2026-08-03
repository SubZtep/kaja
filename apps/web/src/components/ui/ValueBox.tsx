export function ValueBox({
  label,
  variant = "ice",
  children
}: Readonly<{
  label: string
  variant?: "ice" | "neon"
  children: React.ReactNode
}>) {
  const borderColor = variant === "neon" ? "border-neon" : "border-ice"
  const textColor = variant === "neon" ? "text-neon" : "text-ice"

  return (
    <div className={`min-w-40 rounded-xl border-t-2 ${borderColor} bg-surface p-6`}>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p>
      <p className={`text-3xl font-headline font-bold ${textColor} neon-glow`}>{children}</p>
    </div>
  )
}
