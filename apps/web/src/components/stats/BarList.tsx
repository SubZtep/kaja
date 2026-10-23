import { Section } from "../ui/Section"

/** A ranked list with a bar behind each row, scaled to the biggest value. */
export function BarList({
  title,
  rows,
  empty
}: Readonly<{
  title: string
  rows: { key: string; label: React.ReactNode; value: number; note?: string }[]
  empty?: string
}>) {
  const max = Math.max(1, ...rows.map(row => row.value))
  return (
    <Section title={title}>
      {rows.length === 0 ? (
        <p className="text-muted m-0 text-sm">{empty}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {rows.map(row => (
            <li key={row.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-fg min-w-0 truncate font-mono">{row.label}</span>
                <span className="text-muted shrink-0 font-mono">{row.value}</span>
              </div>
              <div className="bg-border/60 mt-1 h-1.5 rounded-full">
                <div className="bg-neon/80 h-full rounded-full" style={{ width: `${(row.value / max) * 100}%` }} />
              </div>
              {row.note && <p className="text-muted m-0 mt-0.5 text-[12px]">{row.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
