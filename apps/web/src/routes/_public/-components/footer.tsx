import { Star } from "lucide-react"
import { BrandMark } from "../../../components/layout/BrandMark"
import { ContentWidth } from "../../../components/layout/ContentWidth"
import { LanguageSelect } from "../../../components/ui/LanguageSelect"
import { m } from "../../../paraglide/messages.js"

/** The legal pages live on the docs site (docs/terms.md, docs/privacy.md). */
export const TERMS_URL = "https://docs.kaja.io/terms/"
export const PRIVACY_URL = "https://docs.kaja.io/privacy/"

export function Footer() {
  return (
    <footer>
      <ContentWidth className="flex flex-wrap items-end justify-between gap-6 py-10 sm:py-16">
        <div>
          <BrandMark monster className="mb-3 text-[17px]" />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 font-crt text-muted text-[13px]">
            <LanguageSelect className="nav-stamp border-fg bg-surface text-fg" />
            <span aria-hidden>·</span>
            <span>{m.footer_license_name()}</span>
            <span aria-hidden>·</span>
            <span>{new Date().getFullYear()}</span>
            <span aria-hidden>·</span>
            <span>
              {m.footer_license_by()}{" "}
              <a href="https://x.com/SubZtep" target="_blank" rel="noopener" className="text-neon">
                SubZtep
              </a>
            </span>
            <span aria-hidden>·</span>
            <span>
              <a href="https://docs.kaja.io" target="_blank" rel="noopener" className="text-muted hover:text-neon">
                {m.nav_docs()}
              </a>
            </span>
            <span aria-hidden>·</span>
            <a href="/llms.txt" className="text-muted hover:text-neon">
              llms.txt
            </a>
            <span aria-hidden>·</span>
            <a href={TERMS_URL} target="_blank" rel="noopener" className="text-muted hover:text-neon">
              {m.legal_terms()}
            </a>
            <span aria-hidden>·</span>
            <a href={PRIVACY_URL} target="_blank" rel="noopener" className="text-muted hover:text-neon">
              {m.legal_privacy()}
            </a>
          </div>
        </div>
        <a
          href="https://github.com/SubZtep/kaja/stargazers"
          target="_blank"
          rel="noopener"
          aria-label={m.footer_star()}
          className="tape-btn inline-flex items-center gap-1.5 px-4 py-2 text-[11px]"
        >
          <Star fill="currentColor" size={11} />
          {m.footer_star()}
        </a>
      </ContentWidth>
    </footer>
  )
}
