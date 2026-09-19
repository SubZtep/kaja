import { registerSchema } from "@kaja/schema/api"
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../components/form/primitives/Button"
import { useAuthClient } from "../../hooks/auth-client"
import { useAppForm } from "../../lib/form"
import { seo } from "../../lib/seo"
import { m } from "../../paraglide/messages.js"
import { AuthCard } from "./-components/auth-card"
import { AuthShell } from "./-components/auth-shell"
import { GoogleSoonButton } from "./-components/google-soon-button"

export const Route = createFileRoute("/_public/signup")({
  component: SignUp,
  head: () => ({
    meta: seo({ title: m.nav_sign_up(), description: m.seo_signup_desc() })
  })
})

function SignUp() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const router = useRouter()
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
          // Reload the root loader's session first; a client-side navigate alone keeps the signed-out one (header, dashboard, roles).
          await router.invalidate()
          navigate({ to: "/welcome" })
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
        {/* Pre-launch notice. Remove before public release. */}
        <p className="animate-pulse mb-6 rounded-sm border border-amber-800 bg-amber-950/40 px-3 py-2 text-[13.5px] text-amber-200">
          This project is under development. The database may be wiped at any time — please don’t rely on any data you
          enter here.
        </p>

        <GoogleSoonButton className="mb-5" />
        <p className="mb-4 text-center font-stamp text-[10px] text-muted uppercase tracking-widest">
          {m.auth_or_email()}
        </p>
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
