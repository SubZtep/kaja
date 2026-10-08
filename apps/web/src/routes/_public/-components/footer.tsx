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
        <div className="grid xs:grid-cols-2 gap-y-8 sm:grid-cols-3">
          <FooterColumn heading={m.footer_heading_project()}>
            <FooterLink href="https://docs.kaja.io" external>
              {m.nav_docs()}
            </FooterLink>
            <FooterLink href="https://github.com/kajaio/kaja" external>
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
            <FooterLink href="https://github.com/kajaio/kaja/blob/main/LICENSE" external>
              {m.footer_license_name()}
            </FooterLink>
          </FooterColumn>
          <div className="col-span-2 contents flex-col gap-y-6 sm:col-span-1 sm:flex">
            <FooterColumn heading={m.language_select_label()}>
              <li>
                <Suspense>
                  <LanguageSelect className="whitespace-nowrap border-border/60 bg-transparent" />
                </Suspense>
              </li>
            </FooterColumn>
            <FooterColumn heading={m.footer_heading_contact()}>
              <li>
                <a href="mailto:hello@kaja.io">hello@kaja.io</a>
              </li>
            </FooterColumn>
          </div>
        </div>

        <div className="mt-8 grid items-center gap-4 border-border/60 border-t pt-6 sm:grid-cols-3 sm:gap-8">
          <span className="sm:col-span-2">
            © {new Date().getFullYear()} Kaja ·{" "}
            <a href="https://x.com/kaja_io" target="_blank" rel="noopener" aria-label="Kaja on X" className="text-neon">
              𝕏
            </a>
          </span>
          <a
            href="https://github.com/kajaio/kaja/stargazers"
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
