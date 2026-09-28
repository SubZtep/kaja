import { Star } from "lucide-react"
import { lazy, type ReactNode, Suspense } from "react"
import { ContentWidth } from "../../../components/layout/ContentWidth"
import { m } from "../../../paraglide/messages.js"

// Its Base UI Select (and floating-ui) is the page's biggest chunk after React; SSR still renders it, only its hydration waits for the download
const LanguageSelect = lazy(() =>
  import("../../../components/ui/LanguageSelect").then(mod => ({ default: mod.LanguageSelect }))
)

/** The legal pages live on the docs site (docs/terms.md, docs/privacy.md). */
export const TERMS_URL = "https://docs.kaja.io/terms/"
export const PRIVACY_URL = "https://docs.kaja.io/privacy/"

export function Footer() {
  return (
    <footer>
      <ContentWidth className="pt-4 pb-10 font-crt text-[13px] text-muted sm:pt-6 sm:pb-16">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          <FooterColumn heading={m.footer_heading_project()}>
            <FooterLink href="https://docs.kaja.io" external>
              {m.nav_docs()}
            </FooterLink>
            <FooterLink href="https://github.com/SubZtep/kaja" external>
              {m.hero_cta_source()}
            </FooterLink>
            <FooterLink href="/llms.txt">llms.txt</FooterLink>
          </FooterColumn>
          <FooterColumn heading={m.footer_heading_legal()}>
            <FooterLink href={TERMS_URL} external>
              {m.legal_terms()}
            </FooterLink>
            <FooterLink href={PRIVACY_URL} external>
              {m.legal_privacy()}
            </FooterLink>
            <FooterLink href="https://github.com/SubZtep/kaja/blob/main/LICENSE" external>
              {m.footer_license_name()}
            </FooterLink>
          </FooterColumn>
          <FooterColumn heading={m.language_select_label()} className="col-span-2 sm:col-span-1">
            <li>
              <Suspense>
                <LanguageSelect className="border-border/60 bg-transparent whitespace-nowrap" />
              </Suspense>
            </li>
          </FooterColumn>
        </div>

        <div className="mt-8 grid items-center gap-4 border-border/60 border-t pt-6 sm:grid-cols-3 sm:gap-8">
          <span className="sm:col-span-2">
            © {new Date().getFullYear()} {m.footer_license_by()}{" "}
            <a href="https://x.com/SubZtep" target="_blank" rel="noopener" className="text-neon">
              SubZtep
            </a>
          </span>
          <a
            href="https://github.com/SubZtep/kaja/stargazers"
            target="_blank"
            rel="noopener"
            aria-label={m.footer_star()}
            className="tape-btn inline-flex items-center gap-1.5 justify-self-start whitespace-nowrap px-4 py-2 text-[11px]"
          >
            <Star fill="currentColor" size={11} />
            {m.footer_star()}
          </a>
        </div>
      </ContentWidth>
    </footer>
  )
}

function FooterColumn({
  heading,
  className,
  children
}: Readonly<{ heading: string; className?: string; children: ReactNode }>) {
  return (
    <div className={className}>
      <p className="m-0 mb-3 font-stamp text-[11px] text-ice uppercase">{heading}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">{children}</ul>
    </div>
  )
}

function FooterLink({ href, external, children }: Readonly<{ href: string; external?: boolean; children: ReactNode }>) {
  return (
    <li>
      <a
        href={href}
        className="text-muted hover:text-neon"
        {...(external ? { target: "_blank", rel: "noopener" } : {})}
      >
        {children}
      </a>
    </li>
  )
}
