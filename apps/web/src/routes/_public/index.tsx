import { createFileRoute, redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders, getRequestUrl } from "@tanstack/react-start/server"
import { seo } from "../../lib/seo"
import { m } from "../../paraglide/messages.js"
import { cookieName, isLocale, localizeHref } from "../../paraglide/runtime.js"
import { Configuration } from "./-components/configuration"
import { Hero } from "./-components/hero"
import { Install } from "./-components/install"
import { MemoryAndDatasets } from "./-components/memory-and-datasets"
import { Personas } from "./-components/personas"
import { WhyKaja } from "./-components/why-kaja"

/** The homepage has no locale prefix for en-GB, so the url strategy always wins there over the cookie. Redirect here once, on the actual unprefixed root request, to honor a returning visitor's saved language. */
const getReturningVisitorLocale = createServerFn({ method: "GET" }).handler(() => {
  if (getRequestUrl().pathname !== "/") return null

  const cookieLocale = getRequestHeaders()
    .get("cookie")
    ?.split(";")
    .map(c => c.trim())
    .find(c => c.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1)

  return cookieLocale ?? null
})

async function loader() {
  const cookieLocale = await getReturningVisitorLocale()

  if (cookieLocale && isLocale(cookieLocale) && cookieLocale !== "en-GB") {
    throw redirect({ href: localizeHref("/", { locale: cookieLocale }) })
  }
}

export const Route = createFileRoute("/_public/")({
  component: LandingPage,
  loader,
  head: () => ({ meta: seo({ description: m.site_og_description() }) })
})

function LandingPage() {
  return (
    <>
      <Hero />
      <WhyKaja />
      <Personas />
      <MemoryAndDatasets />
      <Configuration />
      <Install />
    </>
  )
}
