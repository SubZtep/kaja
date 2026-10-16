import { signInCodeSchema } from "@kaja/schema/api"
import { useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../../components/form/primitives/Button"
import { useAuthClient } from "../../../hooks/auth-client"
import type { Captcha } from "../../../hooks/turnstile"
import { authErrorMessage, validationMessage } from "../../../lib/error-messages"
import { useAppForm } from "../../../lib/form"
import { m } from "../../../paraglide/messages.js"
import { getLocale } from "../../../paraglide/runtime.js"

/** Emails a sign-in code (Turnstile-gated); true once it's on its way. A new address gets it in the page's language. */
export function useSendCode(captcha: Captcha) {
  const authClient = useAuthClient()
  return async (email: string) => {
    const captchaOptions = await captcha.fetchOptions()
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
      fetchOptions: { headers: { ...captchaOptions?.headers, "Accept-Language": getLocale() } }
    })
    if (error) toast.error(authErrorMessage(error))
    return !error
  }
}

/** The second step of signing in or up: the emailed code, with a resend and a way back to the email. */
export function CodeForm({
  email,
  submit,
  verify,
  resend,
  back,
  disabled
}: Readonly<{
  email: string
  submit: string
  verify: (otp: string) => Promise<void>
  resend: () => Promise<boolean>
  back: () => void
  disabled?: boolean
}>) {
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  const form = useAppForm({
    defaultValues: { otp: "" },
    validators: { onSubmit: signInCodeSchema },
    onSubmit: async ({ value }) => {
      const parsed = signInCodeSchema.safeParse(value)
      if (!parsed.success) {
        toast.error(validationMessage(parsed.error.issues[0]?.message))
        return
      }
      setLoading(true)
      try {
        await verify(parsed.data.otp)
      } finally {
        setLoading(false)
      }
    }
  })

  const onResend = async () => {
    setResending(true)
    try {
      if (await resend()) {
        form.reset()
        toast.info(m.auth_code_resent())
      }
    } finally {
      setResending(false)
    }
  }

  return (
    <form
      noValidate
      onSubmit={e => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="flex flex-col gap-4"
    >
      <p className="m-0 text-[13.5px] text-muted">{m.auth_code_sent({ email })}</p>
      <form.AppField name="otp">
        {field => (
          <field.TextField
            label={m.auth_field_code()}
            layout="stack"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            autoFocus
          />
        )}
      </form.AppField>
      <Button type="submit" variant="primary" loading={loading} disabled={disabled} className="mt-1 w-full">
        {submit}
      </Button>
      <div className="flex items-center justify-between gap-3">
        <Button
          size="sm"
          variant="link"
          disabled={loading}
          onClick={back}
          className="mx-0 text-[13px] text-muted hover:text-neon"
        >
          {m.auth_change_email()}
        </Button>
        <Button
          size="sm"
          variant="link"
          loading={resending}
          disabled={loading || disabled}
          onClick={onResend}
          className="mx-0 text-[13px] text-muted hover:text-neon"
        >
          {m.auth_resend_code()}
        </Button>
      </div>
    </form>
  )
}
