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
import { GoogleButton } from "./-components/google-button"

const signinSearchSchema = z.object({
  redirect: z.string().optional(),
  // Set by Better Auth when a Google sign-in fails; signup_disabled means the address has no account yet
  error: z.string().optional()
})

export const Route = createFileRoute("/_public/signin")({
  validateSearch: signinSearchSchema,
  component: SignIn,
  head: () => ({
    meta: seo({ title: m.nav_sign_in(), description: m.seo_signin_desc() })
  })
})

function SignIn() {
  const { redirect, error } = useSearch({ from: "/_public/signin" })
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
      const parsed = loginSchema.safeParse(value)
      if (!parsed.success) {
        toast.error(parsed.error?.message ?? m.signin_error_invalid_data())
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
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : m.signin_error_generic())
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
        {error === "signup_disabled" ? (
          <p className="mb-5 rounded-sm border border-amber-800 bg-amber-950/40 px-3 py-2 text-[13.5px] text-amber-200">
            {m.signin_google_no_account()}{" "}
            <Link to="/signup" className="font-medium text-neon hover:text-neon-hi">
              {m.signin_create_one()}
            </Link>
          </p>
        ) : null}
        <GoogleButton className="mb-5" callbackPath={redirect} />
        <p className="mb-4 text-center font-stamp text-[10px] text-muted uppercase tracking-widest">
          {m.auth_or_email()}
        </p>
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
