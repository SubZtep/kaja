import { useNavigate } from "@tanstack/react-router"
import { LoaderCircle, LogOut } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { useAuthClient } from "../../hooks/auth-client"
import { m } from "../../paraglide/messages.js"
import { ConfirmDialog } from "../ui/ConfirmDialog"

/** A header stamp like the menu items; `compact` (the desktop bar) shows just the icon, with the label as its accessible name. */
export function SignOutButton({ compact, onClick }: Readonly<{ compact?: boolean; onClick?: () => void }>) {
  const navigate = useNavigate()
  const { signOut } = useAuthClient()
  const [loading, setLoading] = useState(false)

  return (
    <ConfirmDialog
      title={m.sign_out_confirm_title()}
      onConfirm={async () => {
        setLoading(true)
        const { error } = await signOut({
          fetchOptions: {
            onSuccess: () => {
              navigate({ to: "/", reloadDocument: true })
            }
          }
        })
        if (error) {
          toast.error(error.message || error.statusText || m.sign_out_error_unknown())
        }
        setLoading(false)
      }}
    >
      <button
        type="button"
        disabled={loading}
        onClick={onClick}
        className="nav-stamp inline-flex items-center gap-2"
        {...(compact ? { "aria-label": m.sign_out(), title: m.sign_out() } : {})}
      >
        {loading ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <LogOut className="size-4" aria-hidden />
        )}
        {compact ? null : m.sign_out()}
      </button>
    </ConfirmDialog>
  )
}
