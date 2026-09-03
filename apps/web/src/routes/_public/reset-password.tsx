import { resetPasswordSchema } from "@kaja/schema/api"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "../../components/form/primitives/Button"
import { useAuthClient } from "../../hooks/auth-client"
import { useAppForm } from "../../lib/form"
import { getPageTitle } from "../../lib/vars"
import { AuthCard } from "./-components/auth-card"
import { AuthShell } from "./-components/auth-shell"

export const Route = createFileRoute("/_public/reset-password")({
  component: ResetPassword,
  validateSearch: z.object({
    token: z.string().optional()
  }),
  head: () => ({ meta: [{ title: getPageTitle("Reset Password") }] })
})

function ResetPassword() {
  const authClient = useAuthClient()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const search = Route.useSearch()

  const form = useAppForm({
    defaultValues: {
      newPassword: ""
    },
    validators: {
      onSubmit: resetPasswordSchema
    },
    onSubmit: async ({ value }) => {
      const parsed = resetPasswordSchema.safeParse(value)
      if (!parsed.success) {
        toast.error(parsed.error?.message ?? "Invalid data")
        return
      }

      try {
        setLoading(true)
        const { data, error } = await authClient.resetPassword({
          newPassword: parsed.data.newPassword,
          token: search.token
        })
        if (error) toast.error(error.message)
        if (data?.status) {
          toast.info("Password changed")
          navigate({ to: "/signin" })
        }
      } catch (error: any) {
        toast.error(error.message)
      } finally {
        setLoading(false)
      }
    }
  })

  return (
    <AuthShell>
      <AuthCard
        title="Reset password"
        description="Choose a new password for your account."
        footer={
          <>
            Remembered it?{" "}
            <Link to="/signin" className="font-medium text-neon hover:text-neon-hi">
              Sign in
            </Link>
          </>
        }
      >
        <form
          onSubmit={event => {
            event.preventDefault()
            form.handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <form.AppField name="newPassword">
            {field => (
              <field.TextField
                label="New password"
                layout="stack"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
              />
            )}
          </form.AppField>

          <Button
            type="submit"
            loading={loading}
            className="mt-1 w-full rounded-md border border-green-600 bg-green-700 font-semibold text-sm text-white hover:bg-green-600"
          >
            Update password
          </Button>
        </form>
      </AuthCard>
    </AuthShell>
  )
}
