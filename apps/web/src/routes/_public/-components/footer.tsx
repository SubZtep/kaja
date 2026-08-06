import { Star } from "lucide-react"
import { BrandMark } from "../../../components/layout/BrandMark"
import { ContentWidth } from "../../../components/layout/ContentWidth"

export function Footer() {
  return (
    <section className="border-border border-t">
      <ContentWidth className="flex flex-wrap items-center justify-between gap-4 py-14">
        <div>
          <div className="mb-1">
            <BrandMark className="text-[15px] font-semibold" />
          </div>
          <div className="text-[#6e7681] text-[13px]">
            MIT License &middot; built with Bun + TypeScript &middot; by{" "}
            <a href="https://x.com/SubZtep" target="_blank" rel="noopener" className="text-muted">
              SubZtep
            </a>{" "}
            &middot; {new Date().getFullYear()}
          </div>
        </div>
        <a
          href="https://github.com/SubZtep/kaja/stargazers"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-4 py-2 text-fg text-[13px]"
        >
          <Star fill="white" size={9} />
          Star on GitHub
        </a>
      </ContentWidth>
    </section>
  )
}
