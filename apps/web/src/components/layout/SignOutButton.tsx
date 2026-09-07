import { useNavigate } from "@tanstack/react-router"
import { LogOut } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { useAuthClient } from "../../hooks/auth-client"
import { m } from "../../paraglide/messages.js"
import { Button } from "../form/primitives/Button"
import { ConfirmDialog } from "../ui/ConfirmDialog"

export function SignOutButton({ onClick }: Readonly<{ onClick?: () => void }>) {
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
      <Button
        variant="oval"
        size="sm"
        loading={loading}
        onClick={onClick}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-1.5 font-medium text-fg"
      >
        <LogOut size={14} />
        {m.sign_out()}
      </Button>
    </ConfirmDialog>
  )
}
