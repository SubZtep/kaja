import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { useEffect, useState } from "react"

export const Route = createFileRoute("/_public")({
  component: PublicLayout
})

const ICONS = [
  { url: "/favicon.ico", hx: 48, hy: 48 },
  { url: "/ladyicon.ico", hx: 48, hy: 48 },
  { url: "/kissicon.ico", hx: 48, hy: 48 },
  { url: "/unicon.ico", hx: 48, hy: 48 },
  { url: "/kissicon-rot.png", hx: 32, hy: 32 }
] as const

function PublicLayout() {
  const router = useRouterState()
  console.log("router.location.pathname", router.location.pathname)
  const isSkipLayout = true // router.location.pathname === "/" || router.location.pathname === "/architecture"

  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI(v => (v + 1) % ICONS.length), 66669)
    return () => clearInterval(id)
  }, [])

  const c = ICONS[i]

  if (isSkipLayout) {
    return <Outlet />
  }

  return (
    <div
      style={{ cursor: `url("${c.url}") ${c.hx} ${c.hy}, auto` }}
      className="fixed inset-0 flex items-center justify-center min-h-screen min-w-full"
    >
      <Outlet />
    </div>
  )
}
