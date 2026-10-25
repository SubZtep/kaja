import { signInCodeSchema } from "@kaja/schema/api"
import { useState } from "react"
import { toast } from "react-toastify"
import { validationMessage } from "../../lib/error-messages"
import { useAppForm } from "../../lib/form"
import { m } from "../../paraglide/messages.js"
import { Button } from "./primitives/button"

/**
 * An emailed code's step (signing in or up, changing the email): the code, a way back, and a resend when `resend` is
 * given.
 */
export function CodeForm({
  email,
  submit,
  verify,
  resend,
  back,
  backLabel = m.auth_change_email(),
  disabled
}: Readonly<{
  email: string
  submit: string
  verify: (otp: string) => Promise<void>
  resend?: () => Promise<boolean>
  back: () => void
  backLabel?: string
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
    if (!resend) return
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
      <p className="text-muted m-0 text-[13.5px]">{m.auth_code_sent({ email })}</p>
      <form.AppField name="otp">
        {field => <field.OtpField label={m.auth_field_code()} length={6} disabled={disabled} autoFocus autoSubmit />}
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
          className="text-muted hover:text-neon mx-0 text-[13px]"
        >
          {backLabel}
        </Button>
        {resend ? (
          <Button
            size="sm"
            variant="link"
            loading={resending}
            disabled={loading || disabled}
            onClick={onResend}
            className="text-muted hover:text-neon mx-0 text-[13px]"
          >
            {m.auth_resend_code()}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
