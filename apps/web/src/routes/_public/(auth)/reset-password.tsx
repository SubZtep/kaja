import { resetPasswordSchema } from "@kaja/schema"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "../../../components/form/primitives/Button"
import { Main } from "../../../components/ui/Main"
import { Section } from "../../../components/ui/Section"
import { useAuthClient } from "../../../hooks/auth-client"
import { useAppForm } from "../../../lib/form"

export const Route = createFileRoute("/_public/(auth)/reset-password")({
  component: ResetPasswordComponent,
  validateSearch: z.object({
    token: z.string().optional()
  })
})

function ResetPasswordComponent() {
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
    <Main>
      <Section className="max-w-lg">
        <h1 className="mb-4">Reset Password</h1>

        <form
          onSubmit={event => {
            event.preventDefault()
            form.handleSubmit()
          }}
          className="flex flex-col gap-2"
        >
          <form.AppField name="newPassword">
            {field => <field.TextField label="New Password" type="password" autoComplete="new-password" />}
          </form.AppField>

          <Button type="submit" loading={loading} className="mt-4">
            Submit
          </Button>
        </form>
      </Section>
    </Main>
  )
}
