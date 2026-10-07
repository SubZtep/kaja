import type { ReactNode } from "react"
import { m } from "../../../paraglide/messages.js"
import { Sticker } from "./sticker"

export function AuthCard({
  title,
  description,
  children,
  footer
}: Readonly<{
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}>) {
  return (
    <div className="relative">
      <Sticker rotate={8} className="pointer-events-none absolute -top-3 right-2 z-1 text-[10px] sm:-right-2">
        {m.hero_badge()}
      </Sticker>
      <div className="paper-card">
        <div className="px-4 py-7 sm:p-8">
          <div className="mb-6">
            <h1 className="m-0 mb-2 font-display font-extrabold text-[28px] text-fg tracking-[-0.03em]">{title}</h1>
            {description ? <p className="m-0 text-[14.5px] text-muted">{description}</p> : null}
          </div>

          {children}

          {footer ? (
            <div className="mt-6 border-border border-t border-dashed pt-5 text-center font-crt text-[13.5px] text-muted">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
