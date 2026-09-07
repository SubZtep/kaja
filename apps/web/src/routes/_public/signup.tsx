import { registerSchema } from "@kaja/schema/api"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../components/form/primitives/Button"
import { useAuthClient } from "../../hooks/auth-client"
import { useAppForm } from "../../lib/form"
import { seo } from "../../lib/seo"
import { m } from "../../paraglide/messages.js"
import { AuthCard } from "./-components/auth-card"
import { AuthShell } from "./-components/auth-shell"

export const Route = createFileRoute("/_public/signup")({
  component: SignUp,
  head: () => ({
    meta: seo({ title: m.nav_sign_up(), description: m.seo_signup_desc() })
  })
})

function SignUp() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { signUp } = useAuthClient()

  const form = useAppForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      image: ""
    },
    validators: {
      onSubmit: registerSchema
    },
    onSubmit: async ({ value }) => {
      const parsed = registerSchema.safeParse(value)
      if (!parsed.success) {
        toast.error(parsed.error?.message ?? m.signup_error_invalid_data())
        return
      }

      try {
        setLoading(true)
        const { error, data } = await signUp.email(parsed.data)

        if (error) toast.error(error.message ?? error.statusText)
        if (data?.user) {
          toast.success(m.signup_success())
          navigate({ to: "/dashboard" })
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
        title={m.signup_title()}
        description={m.seo_signup_desc()}
        footer={
          <>
            {m.signup_have_account()}{" "}
            <Link to="/signin" className="font-medium text-neon hover:text-neon-hi">
              {m.signin_title()}
            </Link>
          </>
        }
      >
        <form
          onSubmit={e => {
            e.preventDefault()
            form.handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <form.AppField name="name">
            {field => (
              <field.TextField
                label={m.auth_field_name()}
                layout="stack"
                placeholder={m.auth_field_name_placeholder()}
                autoComplete="name"
              />
            )}
          </form.AppField>

          <form.AppField name="email">
            {field => (
              <field.TextField
                label={m.auth_field_email()}
                layout="stack"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
              />
            )}
          </form.AppField>

          <form.AppField name="password">
            {field => (
              <field.TextField
                label={m.auth_field_password()}
                layout="stack"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
              />
            )}
          </form.AppField>

          <form.AppField name="image">
            {field => (
              <field.TextField
                label={m.auth_field_image_url()}
                layout="stack"
                placeholder={m.auth_field_image_url_placeholder()}
              />
            )}
          </form.AppField>

          <Button type="submit" variant="primary" loading={loading} className="mt-1 w-full">
            {m.signup_submit()}
          </Button>
        </form>
      </AuthCard>
    </AuthShell>
  )
}
