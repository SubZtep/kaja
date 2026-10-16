import { Field } from "@base-ui/react/field"
import { loginSchema } from "@kaja/schema/api"
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../components/form/primitives/Button"
import { Checkbox } from "../../components/form/primitives/Checkbox"
import { useAuthClient } from "../../hooks/auth-client"
import { CaptchaAlert, useTurnstile } from "../../hooks/turnstile"
import { authErrorMessage, validationMessage } from "../../lib/error-messages"
import { useAppForm } from "../../lib/form"
import { guestOnly } from "../../lib/loaders"
import { seo } from "../../lib/seo"
import { m } from "../../paraglide/messages.js"
import { getLocale } from "../../paraglide/runtime.js"
import { AuthCard } from "./-components/auth-card"
import { AuthShell } from "./-components/auth-shell"
import { CodeForm, useSendCode } from "./-components/email-code"
import { PRIVACY_URL, TERMS_URL } from "./-components/footer"
import { GoogleButton } from "./-components/google-button"

export const Route = createFileRoute("/_public/signup")({
  beforeLoad: () => guestOnly(),
  component: SignUp,
  head: () => ({
    meta: seo({ title: m.nav_sign_up(), description: m.seo_signup_desc() })
  })
})

function SignUp() {
  const [loading, setLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [healthConsent, setHealthConsent] = useState(false)
  const consented = agreed && healthConsent
  const navigate = useNavigate()
  const router = useRouter()
  const { signIn } = useAuthClient()
  const captcha = useTurnstile()
  const sendCode = useSendCode(captcha)
  // The address a code went out to; set, the page asks for the code
  const [email, setEmail] = useState<string>()

  const form = useAppForm({
    defaultValues: {
      email: ""
    },
    validators: {
      onSubmit: loginSchema
    },
    onSubmit: async ({ value }) => {
      const parsed = loginSchema.safeParse(value)
      if (!parsed.success) {
        toast.error(validationMessage(parsed.error.issues[0]?.message))
        return
      }
      if (!consented) {
        toast.error(m.signup_consent_required())
        return
      }

      try {
        setLoading(true)
        if (await sendCode(parsed.data.email)) setEmail(parsed.data.email)
      } catch {
        toast.error(m.error_generic())
      } finally {
        setLoading(false)
      }
    }
  })

  const verify = async (otp: string) => {
    if (!email) return
    // A new address becomes an account only with `consent` (the API refuses it otherwise); an existing one just signs in. The API fills the name and picture from Gravatar.
    const { error, data } = await signIn.emailOtp({ email, otp, consent: true, locale: getLocale() })
    if (error) {
      toast.error(authErrorMessage(error))
      return
    }
    if (data?.user) {
      toast.success(m.signup_success())
      // Reload the root loader's session first; a client-side navigate alone keeps the signed-out one (header, dashboard, roles).
      await router.invalidate()
      navigate({ to: "/dashboard" })
    }
  }

  return (
    <AuthShell>
      <AuthCard
        title={m.signup_title()}
        description={m.signup_disclaimer()}
        footer={
          <>
            {m.signup_have_account()}{" "}
            <Link to="/signin" className="font-medium text-neon hover:text-neon-hi">
              {m.signin_title()}
            </Link>
          </>
        }
      >
        <CaptchaAlert captcha={captcha} />
        {email ? (
          <CodeForm
            email={email}
            submit={m.signup_submit()}
            verify={verify}
            resend={() => sendCode(email)}
            back={() => setEmail(undefined)}
            disabled={!captcha.ready}
          />
        ) : (
          <>
            <div className="mb-5 flex flex-col gap-3 text-[13.5px]">
              <ConsentBox checked={agreed} onChange={setAgreed}>
                <LegalAgreement />
              </ConsentBox>
              <ConsentBox checked={healthConsent} onChange={setHealthConsent}>
                {m.signup_health_consent()}
              </ConsentBox>
            </div>

            <GoogleButton className="mb-5" signUp disabled={!consented} captcha={captcha} />
            <p className="mb-4 text-center font-stamp text-[10px] text-muted uppercase tracking-widest">
              {m.auth_or_email()}
            </p>
            <form
              noValidate
              onSubmit={e => {
                e.preventDefault()
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
                    placeholder="you@example.com"
                    autoComplete="email"
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

// A required consent tick with a rich label (links), which the form's text-only CheckboxField can't take.
function ConsentBox({
  checked,
  onChange,
  children
}: Readonly<{ checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }>) {
  return (
    <Field.Root>
      <Field.Label className="flex cursor-pointer items-start gap-2">
        <Checkbox checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
        <span>{children}</span>
      </Field.Label>
    </Field.Root>
  )
}

// `signup_legal` with its `{terms}` and `{privacy}` placeholders turned into links, so each language keeps its own word order.
function LegalAgreement() {
  const links: Record<string, { href: string; label: string }> = {
    "{terms}": { href: TERMS_URL, label: m.legal_terms() },
    "{privacy}": { href: PRIVACY_URL, label: m.legal_privacy() }
  }
  return m
    .signup_legal({ terms: "{terms}", privacy: "{privacy}" })
    .split(/(\{terms\}|\{privacy\})/)
    .map(part => {
      const link = links[part]
      if (!link) return part
      return (
        <a
          key={part}
          href={link.href}
          target="_blank"
          rel="noopener"
          className="text-neon underline underline-offset-2 hover:text-neon-hi"
        >
          {link.label}
        </a>
      )
    })
}
