import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "../../../../components/form/primitives/Button"
import { useAuthClient } from "../../../../hooks/auth-client"
import { logger } from "../../../../lib/logger"

export const Route = createFileRoute("/_public/(auth)/device/")({
  validateSearch: z.object({
    user_code: z.string().optional()
  }),
  component: DeviceCodePage
})

function DeviceCodePage() {
  const authClient = useAuthClient()
  const navigate = useNavigate()
  const search = Route.useSearch()
  const [userCode, setUserCode] = useState(() => search.user_code ?? "")
  const [loading, setLoading] = useState(false)

  async function login() {
    setLoading(true)
    try {
      const { data, error } = await authClient.device({ query: { user_code: userCode } })
      if (error) {
        toast.error(error.statusText ?? "Invalid or expired code")
        return
      }
      if (data) {
        if (data.status === "pending") {
          toast.success("User code accepted, redirecting...")
          await navigate({
            to: "/device/approve",
            search: { user_code: userCode }
          })
        } else {
          toast.error("This code has already been used")
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong")
      logger.error({ error }, "Device code login error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userCode.length >= 4) {
      toast.success("User code accepted, redirecting...")
      login()
    }
  }, [])

  return (
    <>
      <h1>Connect a device</h1>
      <p>Enter the code shown in your terminal.</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={async ev => {
          ev.preventDefault()
          await login()
        }}
      >
        <input
          className="border border-input rounded-md px-3 py-2 bg-background"
          value={userCode}
          onChange={ev => setUserCode(ev.target.value)}
          placeholder="e.g. ABCD1234"
          maxLength={16}
          autoComplete="one-time-code"
          minLength={4}
        />
        <Button type="submit" loading={loading} size="lg" variant="primary">
          Continue
        </Button>
      </form>
    </>
  )
}
