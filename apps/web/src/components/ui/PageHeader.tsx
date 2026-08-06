import type { ReactNode } from "react"

/** Shared page title block aligned with public section headers. */
export function PageHeader({
  title,
  description,
  meta,
  children
}: Readonly<{
  title: ReactNode
  description?: ReactNode
  meta?: ReactNode
  children?: ReactNode
}>) {
  return (
    <header className="mb-8 flex flex-col justify-between gap-6 lg:mb-10 lg:flex-row lg:items-end">
      <div className="max-w-2xl">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="m-0 mb-0 font-bold text-fg text-[26px] tracking-[-0.01em]">{title}</h1>
          {meta ? <span className="font-mono text-[#6e7681] text-xs">{meta}</span> : null}
        </div>
        {description ? <p className="m-0 max-w-lg text-[14.5px] text-muted">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-3">{children}</div> : null}
    </header>
  )
}
