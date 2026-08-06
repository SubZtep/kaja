import type { ReactNode } from "react"
import { Section } from "../../../components/ui/Section"

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
    <Section className="shadow-[0_24px_60px_-20px_#000a]" padded={false}>
      <div className="px-6 py-7 sm:px-8 sm:py-8">
        <div className="mb-6">
          <h1 className="m-0 mb-2 font-bold text-fg text-[26px] tracking-[-0.02em]">{title}</h1>
          {description ? <p className="m-0 text-[14.5px] text-muted">{description}</p> : null}
        </div>

        {children}

        {footer ? (
          <div className="mt-6 border-border border-t pt-5 text-center text-[13.5px] text-muted">{footer}</div>
        ) : null}
      </div>
    </Section>
  )
}
