import { cn } from "@kaja/shared"
import type { ReactNode } from "react"
import { ContentWidth } from "../layout/ContentWidth"

/** Public landing band: optional alt surface + centered content column. */
export function LandingSection({
  alt = false,
  className,
  contentClassName,
  children
}: Readonly<{
  alt?: boolean
  className?: string
  contentClassName?: string
  children: ReactNode
}>) {
  return (
    <section className={cn(alt && "border-border border-y bg-surface-2", className)}>
      <ContentWidth className={cn("py-10 sm:py-18", contentClassName)}>{children}</ContentWidth>
    </section>
  )
}

export function LandingSectionTitle({
  title,
  meta,
  description
}: Readonly<{
  title: ReactNode
  meta?: ReactNode
  description?: ReactNode
}>) {
  return (
    <>
      <div className={cn("flex flex-wrap items-baseline justify-between gap-2", description ? "mb-2" : "mb-7")}>
        <h2 className="m-0 font-bold text-fg text-[26px]">{title}</h2>
        {meta ? <span className="font-mono text-[#6e7681] text-xs">{meta}</span> : null}
      </div>
      {description ? <p className="mb-7 max-w-160 text-[14.5px] text-muted">{description}</p> : null}
    </>
  )
}
