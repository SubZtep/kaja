import { formatDeviceUserCode } from "@kaja/shared"
import { createFileRoute, redirect, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../../components/form/primitives/Button"
import { useAuthClient } from "../../../hooks/auth-client"
import { clearStashedDeviceCode, getStashedDeviceCode } from "../../../lib/device-code"
import { seo } from "../../../lib/seo"

export const Route = createFileRoute("/_public/device/approve")({
  loader: async () => {
    const userCode = await getStashedDeviceCode()
    if (!userCode) {
      throw redirect({ to: "/device" })
    }
    return userCode
  },
  component: DeviceApprovePage,
  head: () => ({ meta: seo({ title: "Approve Device" }) })
})

function DeviceApprovePage() {
  const userCode = useLoaderData({ from: "/_public/device/approve" })
  const { session, sessionError } = useLoaderData({ from: "__root__" })
  const authClient = useAuthClient()
  const navigate = useNavigate()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimed, setClaimed] = useState(false)

  useEffect(() => {
    if (!sessionError && !session?.user) {
      navigate({ to: "/signin", search: { redirect: "/device/approve" } })
    }
  }, [sessionError, session?.user])

  // Associate this device code with the current session before allowing approve/deny
  useEffect(() => {
    if (!session?.user) {
      return
    }
    let cancelled = false
    authClient.device({ query: { user_code: userCode } }).then(({ data, error }) => {
      if (cancelled) {
        return
      }
      if (error || data?.status !== "pending") {
        setClaimError(error?.statusText ?? "Invalid or expired code")
        return
      }
      setClaimed(true)
    })
    return () => {
      cancelled = true
    }
  }, [session?.user, userCode])

  if (sessionError) {
    return (
      <>
        <h1 className="text-neon-hi/80">Couldn't verify your session</h1>
        <p>
          Something went wrong checking whether you're signed in.
          <br />
          Please try again.
        </p>
        <Button onClick={() => router.invalidate()} variant="primary" size="md">
          Retry
        </Button>
      </>
    )
  }

  if (!session?.user) {
    return null
  }

  if (claimError) {
    return (
      <>
        <h1 className="text-neon-hi/80">Invalid code</h1>
        <p>
          {claimError}
          <br />
          Please check the code or the link, and try again.
        </p>
        <Button onClick={() => navigate({ to: "/dashboard" })} variant="primary" size="md">
          Go to Dashboard
        </Button>
      </>
    )
  }

  if (!claimed) {
    return null
  }

  async function approve() {
    setLoading(true)
    try {
      const { error } = await authClient.device.approve({ userCode })
      if (error) {
        toast.error(error.statusText ?? "Failed to approve")
        return
      }
      await clearStashedDeviceCode()
      toast.success("Device approved — you can return to the TUI.")
      await navigate({ to: "/dashboard" })
    } finally {
      setLoading(false)
    }
  }

  async function deny() {
    setLoading(true)
    try {
      const { error } = await authClient.device.deny({ userCode })
      if (error) {
        toast.error(error.statusText ?? "Failed to deny")
        return
      }
      await clearStashedDeviceCode()
      toast.info("Request denied.")
      await navigate({ to: "/dashboard" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1>Approve TUI access</h1>
      <p>The Kaja TUI asked to be accessable by your account.</p>
      <p>
        Code: <span className="text-2xl text-fg tracking-widest font-semibold">{formatDeviceUserCode(userCode)}</span>
      </p>
      <div className="flex gap-2 flex-wrap">
        <Button type="button" loading={loading} onClick={approve} autoFocus>
          Approve
        </Button>
        <Button type="button" variant="oval" disabled={loading} onClick={deny}>
          Deny
        </Button>
      </div>
    </>
  )
}
