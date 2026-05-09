import { cn } from "@kaja/shared"
import { Link, useNavigate } from "@tanstack/react-router"
import { LogOut } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { useAuthClient } from "#/hooks/auth-client"
import { useUser } from "#/hooks/user"
import { getSidebarItems } from "./nav-items"

export function Sidebar() {
  const user = useUser()
  const navItems = getSidebarItems(user?.role)

  return (
    <aside className="hidden md:flex flex-col py-8 px-4 h-screen w-64 fixed left-0 top-0 bg-bg z-50">
      {/* <div className="mb-12 px-2">
        <h1 className="text-neon neon-glow font-bold tracking-widest uppercase text-xl font-headline mb-0">Admin</h1>
        <p className="text-muted text-xs mt-1 uppercase tracking-widest">Directory Management</p>
      </div> */}
      {user && (
        <div className="flex items-center gap-3 px-4 pb-6 rounded-lg">
          {/* <div className="flex items-center gap-3 px-4 py-3 rounded-lg"> */}
          <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-neon">{user.name?.charAt(0)?.toUpperCase() ?? "?"}</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-fg truncate">{user.name}</span>
            <span className="text-xs text-muted capitalize">{user.role ?? "User"}</span>
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-1">
        {navItems.map(item => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === "/dashboard" }}
            className="flex items-center gap-3 px-4 py-3 rounded-lg font-headline text-sm font-semibold tracking-tight text-muted hover:text-fg hover:bg-surface-2/50 transition-colors duration-200"
            activeProps={{
              className:
                "text-neon bg-neon/10 border-r-2 border-neon opacity-90 shadow-[0_0_12px_rgba(255,63,181,0.35)]"
            }}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto space-y-1 border-t border-border/40 pt-6">
        <SignOutButton />
      </div>
    </aside>
  )
}

function SignOutButton() {
  const navigate = useNavigate()
  const { signOut } = useAuthClient()
  const [loading, setLoading] = useState(false)

  const handleSignOut = async () => {
    setLoading(true)
    const { error } = await signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate({ to: "/", reloadDocument: true })
        }
      }
    })
    if (error) {
      toast.error(error.message ?? error.statusText)
    }
    setLoading(false)
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className={cn(
        "flex cursor-crosshair items-center gap-3 px-4 py-3 rounded-lg font-headline text-sm font-semibold tracking-tight text-muted hover:text-fg hover:bg-surface-2/50 transition-colors duration-200 w-full",
        loading && "opacity-50 pointer-events-none"
      )}
    >
      <LogOut size={20} />
      <span>Sign Out</span>
    </button>
  )
}
