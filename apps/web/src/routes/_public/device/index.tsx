import { createFileRoute } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { useState } from "react"
import { z } from "zod"
import { Button } from "../../../components/form/primitives/Button"
import { stashDeviceCodeAndRedirect } from "../../../lib/device-code"
import { seo } from "../../../lib/seo"
import { m } from "../../../paraglide/messages.js"

export const Route = createFileRoute("/_public/device/")({
  validateSearch: z.object({
    user_code: z.string().optional()
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
        className="flex flex-col gap-4"
        onSubmit={async ev => {
          ev.preventDefault()
          await login()
        }}
      >
        <input
          className="border border-border rounded-md px-3 py-2 bg-surface"
          value={userCode}
          onChange={ev => setUserCode(ev.target.value)}
          placeholder={m.device_code_placeholder()}
          maxLength={16}
          autoComplete="one-time-code"
          minLength={4}
        />
        <Button type="submit" loading={loading} size="lg" variant="primary">
          {m.device_continue()}
        </Button>
      </form>
    </>
  )
}
