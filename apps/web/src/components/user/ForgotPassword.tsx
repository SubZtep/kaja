import { loginSchema } from "@kaja/schema"
import { CheckCircle, LoaderCircle } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { useAuthClient } from "../../hooks/auth-client"
import { ConfirmDialog } from "../ui/ConfirmDialog"

export function ForgotPassword({
  getEmail,
  children
}: Readonly<{ getEmail: () => string; children: React.ReactElement }>) {
  const authClient = useAuthClient()
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleConfirm = async () => {
    const parsed = loginSchema.pick({ email: true }).safeParse({ email: getEmail() })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid email")
      return
    }

    try {
      setLoading(true)
      const { data, error } = await authClient.requestPasswordReset({
        email: parsed.data.email,
        redirectTo: `${window.location.origin}/reset-password`
      })
      if (error) {
        toast.error(error.message ?? error.statusText)
        return
      }
      if (data) toast.info(data.message)
      setSent(true)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <LoaderCircle className="animate-spin" />
  }

  if (sent) {
    return (
      <div className="flex items-center gap-2 justify-center opacity-65 text-sm">
        <CheckCircle className="text-green-500" />
        <span>Email sent</span>
      </div>
    )
  }

  return (
    <ConfirmDialog
      title="Forgot Password?"
      description="An email will be sent to you with a link to reset your password."
      confirm="Send Email"
      onConfirm={handleConfirm}
      confirmClassName="text-green-500"
    >
      {children}
    </ConfirmDialog>
  )
}
