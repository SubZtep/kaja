import { Star } from "lucide-react"
import { BrandMark } from "../../../components/layout/BrandMark"
import { ContentWidth } from "../../../components/layout/ContentWidth"
import { m } from "../../../paraglide/messages.js"

export function Footer() {
  return (
    <section className="border-border border-t">
      <ContentWidth className="flex flex-wrap items-center justify-between gap-4 py-8 sm:py-14">
        <div>
          <div className="mb-1">
            <BrandMark className="text-[15px] font-semibold" />
          </div>
          <div className="text-[#6e7681] text-[13px]">
            {m.footer_license_name()} · {new Date().getFullYear()} · {m.footer_license_by()}{" "}
            <a href="https://x.com/SubZtep" target="_blank" rel="noopener" className="text-muted">
              SubZtep
            </a>{" "}
            ·{" "}
            <a href="/llms.txt" className="text-muted">
              llms.txt
            </a>{" "}
            · 🕳
          </div>
        </div>
        <a
          href="https://github.com/SubZtep/kaja/stargazers"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-4 py-2 text-fg text-[13px]"
        >
          <Star fill="yellow" size={9} />
          {m.footer_star()}
        </a>
      </ContentWidth>
    </section>
  )
}
