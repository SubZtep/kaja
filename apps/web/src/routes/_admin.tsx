import { createFileRoute, Outlet } from "@tanstack/react-router"
import { useEffect } from "react"
import { ContentWidth } from "../components/layout/content-width"
import { SiteShell } from "../components/layout/site-shell"
import { userRequired } from "../lib/loaders"
import { noindexSeo } from "../lib/seo"

export const Route = createFileRoute("/_admin")({
  component: AdminLayoutRoute,
  loader: ({ context, location }) => userRequired(context.session, undefined, location.href),
  head: () => ({ meta: noindexSeo() })
})

function AdminLayoutRoute() {
  // Sign-in starts the drifting background on <body>; private pages stay still
  useEffect(() => document.body.classList.remove("bg-drift"), [])

  return (
    // Same grit as the public pages (torn header edge, the #wobble filters the stamps and cards use), without the scanline
    <SiteShell className="grit-still">
      <ContentWidth className="flex-1 py-10 md:py-14">
        <Outlet />
      </ContentWidth>
    </SiteShell>
  )
}
