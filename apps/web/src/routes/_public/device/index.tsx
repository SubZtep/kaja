import { Field } from "@base-ui/react/field"
import { createFileRoute } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { useState } from "react"
import { Button } from "../../../components/form/primitives/button"
import { Otp } from "../../../components/form/primitives/otp"
import { stashDeviceCodeAndRedirect } from "../../../lib/device-code"
import { searchString } from "../../../lib/search"
import { seo } from "../../../lib/seo"
import { m } from "../../../paraglide/messages.js"

// Better Auth's default userCodeLength
const DEVICE_CODE_LENGTH = 8

export const Route = createFileRoute("/_public/device/")({
  validateSearch: (search: Record<string, unknown>): { user_code?: string } => ({
    user_code: searchString(search.user_code)
  }),
  loaderDeps: ({ search }) => ({ user_code: search.user_code }),
  loader: async ({ deps }) => {
    if (deps.user_code) {
      await stashDeviceCodeAndRedirect({ data: deps.user_code })
    }
  },
  component: DeviceCodePage,
  head: () => ({ meta: seo({ title: m.seo_device_title() }) })
})

function DeviceCodePage() {
  const stashAndRedirect = useServerFn(stashDeviceCodeAndRedirect)
  const [userCode, setUserCode] = useState("")
  const [loading, setLoading] = useState(false)

  async function login() {
    setLoading(true)
    try {
      await stashAndRedirect({ data: userCode })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1>{m.device_title()}</h1>
      <p>{m.device_description()}</p>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={async ev => {
          ev.preventDefault()
          await login()
        }}
      >
        <Field.Root className="flex flex-col gap-1.5">
          <Field.Label className="text-muted text-[13px] font-medium">{m.device_code_label()}</Field.Label>
          <Otp
            length={DEVICE_CODE_LENGTH}
            groupSize={4}
            validationType="alphanumeric"
            normalizeValue={value => value.toUpperCase()}
            value={userCode}
            onValueChange={setUserCode}
            autoFocus
            autoSubmit
          />
        </Field.Root>
        <Button
          type="submit"
          loading={loading}
          disabled={userCode.length < DEVICE_CODE_LENGTH}
          size="lg"
          variant="primary"
        >
          {m.device_continue()}
        </Button>
      </form>
    </>
  )
}
