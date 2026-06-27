import { createFileRoute, Outlet } from "@tanstack/react-router"
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
  const [i, setI] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setI(v => (v + 1) % ICONS.length), 666_69)
    document.body.classList.add("anim")

    return () => {
      clearInterval(id)
      document.body.classList.remove("anim")
    }
  }, [])

  const c = ICONS[i]

  return (
    <div
      style={{ cursor: `url("${c.url}") ${c.hx} ${c.hy}, auto` }}
      className="fixed inset-0 flex items-center justify-center min-h-screen min-w-full"
    >
      <Outlet />
    </div>
  )
}
