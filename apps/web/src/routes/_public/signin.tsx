import { loginSchema } from "@kaja/schema/api"
import { createFileRoute, Link, useSearch } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "react-toastify"
import { CodeForm } from "../../components/form/CodeForm"
import { Button } from "../../components/form/primitives/Button"
import { useAuthClient } from "../../hooks/auth-client"
import { CaptchaAlert, useTurnstile } from "../../hooks/turnstile"
import { authErrorMessage, validationMessage } from "../../lib/error-messages"
import { useAppForm } from "../../lib/form"
import { guestOnly } from "../../lib/loaders"
import { searchString } from "../../lib/search"
import { seo } from "../../lib/seo"
import { m } from "../../paraglide/messages.js"
import { localizeHref } from "../../paraglide/runtime.js"
import { AuthCard } from "./-components/auth-card"
import { AuthShell } from "./-components/auth-shell"
import { useSendCode } from "./-components/email-code"
import { GoogleButton } from "./-components/google-button"

const signinSearchSchema = (search: Record<string, unknown>): { redirect?: string; error?: string } => ({
  redirect: searchString(search.redirect),
  // Set by Better Auth when a Google sign-in fails; signup_disabled means the address has no account yet
  error: searchString(search.error)
})

export const Route = createFileRoute("/_public/signin")({
  validateSearch: signinSearchSchema,
  beforeLoad: ({ search }) => guestOnly(search.redirect),
  component: SignIn,
  head: () => ({
    meta: seo({ title: m.nav_sign_in(), description: m.seo_signin_desc() })
  })
})

function SignIn() {
  const { redirect, error } = useSearch({ from: "/_public/signin" })
  const authClient = useAuthClient()
  const captcha = useTurnstile()
  const sendCode = useSendCode(captcha)
  const [loading, setLoading] = useState(false)
  // The address a code went to; set, the page asks for the code
  const [email, setEmail] = useState<string>()
  const [noAccount, setNoAccount] = useState(false)

  const form = useAppForm({
    defaultValues: { email: "" },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      const parsed = loginSchema.safeParse(value)
      if (!parsed.success) {
        toast.error(validationMessage(parsed.error.issues[0]?.message))
        return
      }
      setLoading(true)
      try {
        if (await sendCode(parsed.data.email)) {
          setNoAccount(false)
          setEmail(parsed.data.email)
        }
      } catch {
        toast.error(m.signin_error_generic())
      } finally {
        setLoading(false)
      }
    }
  })

  const verify = async (otp: string) => {
    if (!email) return
    const { error: authError } = await authClient.signIn.emailOtp({ email, otp })
    if (authError) {
      // A new address can only become an account on the sign-up page, with its consent boxes
      if (authError.code === "CONSENT_REQUIRED") {
        setNoAccount(true)
        setEmail(undefined)
      } else toast.error(authErrorMessage(authError))
      return
    }
    document.body.classList.add("bg-drift")
    // A full load, so the root loader starts with the new session
    window.location.assign(localizeHref(redirect ?? "/dashboard"))
  }

  return (
    <AuthShell>
      <AuthCard
        title={m.signin_title()}
        description={m.seo_signin_desc()}
        footer={
          <>
            {m.signin_no_account()}{" "}
            <Link to="/signup" className="text-neon hover:text-neon-hi font-medium">
              {m.signin_create_one()}
            </Link>
          </>
        }
      >
        {error === "signup_disabled" || noAccount ? (
          <p className="mb-5 rounded-sm border border-amber-800 bg-amber-950/40 px-3 py-2 text-[13.5px] text-amber-200">
            {noAccount ? m.signin_email_no_account() : m.signin_google_no_account()}{" "}
            <Link to="/signup" className="text-neon hover:text-neon-hi font-medium">
              {m.signin_create_one()}
            </Link>
          </p>
        ) : null}
        <CaptchaAlert captcha={captcha} />
        {email ? (
          <CodeForm
            email={email}
            submit={m.signin_submit()}
            verify={verify}
            resend={() => sendCode(email)}
            back={() => setEmail(undefined)}
            disabled={!captcha.ready}
          />
        ) : (
          <>
            <GoogleButton className="mb-5" callbackPath={redirect} captcha={captcha} />
            <p className="font-stamp text-muted mb-4 text-center text-[10px] tracking-widest uppercase">
              {m.auth_or_email()}
            </p>
            <form
              noValidate
              onSubmit={event => {
                event.preventDefault()
                form.handleSubmit()
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

              <Button
                type="submit"
                variant="primary"
                loading={loading}
                disabled={!captcha.ready}
                className="mt-1 w-full"
              >
                {m.auth_send_code()}
              </Button>
            </form>
          </>
        )}
      </AuthCard>
    </AuthShell>
  )
}
