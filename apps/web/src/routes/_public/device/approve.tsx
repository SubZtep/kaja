import { formatDeviceUserCode } from "@kaja/shared"
import { createFileRoute, useLoaderData, useNavigate, useRouter, useSearch } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "../../../components/form/primitives/Button"
import { useAuthClient } from "../../../hooks/auth-client"
import { seo } from "../../../lib/seo"

export const Route = createFileRoute("/_public/device/approve")({
  validateSearch: z.object({
    user_code: z.string().optional()
  }),
  component: DeviceApprovePage,
  head: () => ({ meta: seo({ title: "Approve Device" }) })
})

function DeviceApprovePage() {
  const params = useSearch({ from: "/_public/device/approve" })
  const { session, sessionError } = useLoaderData({ from: "__root__" })
  const authClient = useAuthClient()
  const navigate = useNavigate()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimed, setClaimed] = useState(false)

  useEffect(() => {
    if (!sessionError && !session?.user && params.user_code) {
      navigate({
        to: "/signin",
        search: {
          redirect: `/device/approve?user_code=${encodeURIComponent(params.user_code)}`
        }
      })
    }
  }, [sessionError, session?.user, params.user_code])

  // Associate this device code with the current session before allowing approve/deny
  useEffect(() => {
    if (!session?.user || !params.user_code) {
      return
    }
    let cancelled = false
    authClient.device({ query: { user_code: params.user_code } }).then(({ data, error }) => {
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
  }, [session?.user, params.user_code])

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

  if (!params.user_code || params.user_code.length < 4) {
    return (
      <>
        <h1 className="text-neon-hi/80">{params.user_code ? "Invalid" : "Missing"} user code</h1>
        <p>
          Please check the code or the link, and try again.
          <br />
          So close to connect.
        </p>
        <Button onClick={() => navigate({ to: "/dashboard" })} variant="primary" size="md">
          Go to Dashboard
        </Button>
      </>
    )
  }

  // TypeScript now knows user_code is a non-empty string here
  const user_code: string = params.user_code

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
      const { error } = await authClient.device.approve({ userCode: user_code })
      if (error) {
        toast.error(error.statusText ?? "Failed to approve")
        return
      }
      toast.success("Device approved — you can return to the TUI.")
      await navigate({ to: "/dashboard" })
    } finally {
      setLoading(false)
    }
  }

  async function deny() {
    setLoading(true)
    try {
      const { error } = await authClient.device.deny({ userCode: user_code })
      if (error) {
        toast.error(error.statusText ?? "Failed to deny")
        return
      }
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
        Code: <span className="text-2xl text-fg tracking-widest font-semibold">{formatDeviceUserCode(user_code)}</span>
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
