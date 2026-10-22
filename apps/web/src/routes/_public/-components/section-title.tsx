import type { ReactNode } from "react"

/** A landing section's heading, with an optional sticker beside it and a plain line under it. */
export function SectionTitle({
  title,
  sticker,
  subtitle
}: Readonly<{ title: string; sticker?: ReactNode; subtitle?: string }>) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-fg m-0 text-2xl font-extrabold text-balance sm:text-3xl md:text-4xl">
          {title}
        </h2>
        {sticker}
      </div>
      {subtitle ? <p className="font-crt text-muted mt-2 mb-0 text-sm">{subtitle}</p> : null}
    </div>
  )
}
