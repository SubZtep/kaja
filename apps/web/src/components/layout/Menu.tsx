import { cn } from "@kaja/shared"
import { Link, useNavigate } from "@tanstack/react-router"
import { type CSSProperties, useState } from "react"
import { toast } from "react-toastify"
import { useAuthClient } from "../../hooks/auth-client"
import { useUser } from "../../hooks/user"
import { Button } from "../form/primitives/Button"
import { ConfirmDialog } from "../ui/ConfirmDialog"
import { getMenuItems } from "./nav-items"

export function Menu({ className }: Readonly<{ className?: string }>) {
  const role = useUser()?.role
  const items = getMenuItems(role)

  return (
    <nav className={cn("flex items-center gap-x-4 text-sm font-semibold w-full h-(--menu-height) px-4", className)}>
      {items.map((item, index) => (
        <MenuItem key={item.to} to={item.to} style={{ animationDelay: `${index * 90 + 80}ms` }}>
          {item.label}
        </MenuItem>
      ))}
      {role && (
        <div className="ml-auto">
          <LogoutButton />
        </div>
      )}
    </nav>
  )
}

function MenuItem({ to, style, children }: Readonly<{ to: string; style?: CSSProperties; children: React.ReactNode }>) {
  return (
    <Link to={to} className="nav-link animate-rise-in" activeProps={{ className: "nav-link is-active" }} style={style}>
      {children}
    </Link>
  )
}

function LogoutButton() {
  const navigate = useNavigate()
  const { signOut } = useAuthClient()
  const [loading, setLoading] = useState(false)

  return (
    <ConfirmDialog
      title="Sign Out?"
      onConfirm={async () => {
        setLoading(true)

        const { error } = await signOut({
          fetchOptions: {
            onSuccess: () => {
              navigate({
                to: "/",
                reloadDocument: true
              })
            }
          }
        })

        if (error) {
          toast.error(error.message || error.statusText || "An unknown error occurred")
        }

        setLoading(false)
      }}
    >
      <Button variant="oval" size="sm" className="cursor-crosshair" loading={loading}>
        Sign Out
      </Button>
    </ConfirmDialog>
  )
}
