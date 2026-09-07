import { resetPasswordSchema } from "@kaja/schema/api"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "../../components/form/primitives/Button"
import { useAuthClient } from "../../hooks/auth-client"
import { useAppForm } from "../../lib/form"
import { seo } from "../../lib/seo"
import { m } from "../../paraglide/messages.js"
import { AuthCard } from "./-components/auth-card"
import { AuthShell } from "./-components/auth-shell"

export const Route = createFileRoute("/_public/reset-password")({
  component: ResetPassword,
  validateSearch: z.object({
    token: z.string().optional()
  }),
  head: () => ({
    meta: seo({ title: m.seo_reset_password_title(), description: m.seo_reset_password_desc() })
  })
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
        toast.error(parsed.error?.message ?? m.reset_password_error_invalid_data())
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
          toast.info(m.reset_password_success())
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
        title={m.reset_password_title()}
        description={m.seo_reset_password_desc()}
        footer={
          <>
            {m.reset_password_remembered()}{" "}
            <Link to="/signin" className="font-medium text-neon hover:text-neon-hi">
              {m.signin_title()}
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
                label={m.auth_field_new_password()}
                layout="stack"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
              />
            )}
          </form.AppField>

          <Button type="submit" variant="primary" loading={loading} className="mt-1 w-full">
            {m.reset_password_submit()}
          </Button>
        </form>
      </AuthCard>
    </AuthShell>
  )
}
