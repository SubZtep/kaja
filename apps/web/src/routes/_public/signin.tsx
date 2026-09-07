import { error, trace } from "@kaja/logger"
import { loginSchema } from "@kaja/schema/api"
import { createFileRoute, Link, useSearch } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "../../components/form/primitives/Button"
import { ForgotPassword } from "../../components/user/ForgotPassword"
import { useAuthClient } from "../../hooks/auth-client"
import { useAppForm } from "../../lib/form"
import { seo } from "../../lib/seo"
import { m } from "../../paraglide/messages.js"
import { localizeHref } from "../../paraglide/runtime.js"
import { AuthCard } from "./-components/auth-card"
import { AuthShell } from "./-components/auth-shell"

const signinSearchSchema = z.object({
  redirect: z.string().optional()
})

export const Route = createFileRoute("/_public/signin")({
  validateSearch: signinSearchSchema,
  component: SignIn,
  head: () => ({
    meta: seo({ title: m.nav_sign_in(), description: m.seo_signin_desc() })
  })
})

function SignIn() {
  const { redirect } = useSearch({ from: "/_public/signin" })
  const authClient = useAuthClient()
  const [loading, setLoading] = useState(false)

  const form = useAppForm({
    defaultValues: {
      email: "",
      password: "",
      rememberMe: true
    },
    validators: {
      onSubmit: loginSchema
    },
    onSubmit: async ({ value }) => {
      trace("Sign in form submitted", { value })
      const parsed = loginSchema.safeParse(value)
      if (!parsed.success) {
        toast.error(parsed.error?.message ?? m.signin_error_invalid_data())
        error("Sign in form validation failed", { error: parsed.error })
        return
      }

      try {
        setLoading(true)
        const { error: authError } = await authClient.signIn.email({
          ...parsed.data,
          callbackURL: localizeHref(redirect ?? "/dashboard")
        })
        if (authError) {
          toast.error(authError.message ?? authError.statusText)
          error("Sign in failed", { error: authError })
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : m.signin_error_generic())
        error("Sign in fail catched", { error: err })
      } finally {
        setLoading(false)
      }

      document.body.classList.add("bg-drift")
    }
  })

  return (
    <AuthShell>
      <AuthCard
        title={m.signin_title()}
        description={m.seo_signin_desc()}
        footer={
          <>
            {m.signin_no_account()}{" "}
            <Link to="/signup" className="font-medium text-neon hover:text-neon-hi">
              {m.signin_create_one()}
            </Link>
          </>
        }
      >
        <form
          onSubmit={event => {
            event.preventDefault()
            const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement
            form.handleSubmit({ action: submitter?.value })
          }}
          className="flex flex-col gap-4"
        >
          <form.AppField name="email">
            {field => (
              <field.TextField
                label={m.auth_field_email()}
                layout="stack"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
              />
            )}
          </form.AppField>

          <form.AppField name="password">
            {field => (
              <field.TextField
                label={m.auth_field_password()}
                layout="stack"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
              />
            )}
          </form.AppField>

          <div className="flex items-center justify-between gap-3">
            <form.AppField name="rememberMe">
              {field => <field.CheckboxField label={m.auth_field_remember_me()} className="text-[13px] text-muted" />}
            </form.AppField>

            <ForgotPassword getEmail={() => form.state.values.email}>
              <Button
                size="sm"
                variant="link"
                disabled={loading}
                className="text-[13px] text-muted hover:text-neon mx-0"
              >
                {m.auth_field_forgot_password()}
              </Button>
            </ForgotPassword>
          </div>

          <Button type="submit" variant="primary" loading={loading} className="mt-1 w-full">
            {m.signin_submit()}
          </Button>
        </form>
      </AuthCard>
    </AuthShell>
  )
}
