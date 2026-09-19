import { formatDeviceUserCode } from "@kaja/shared"
import { createFileRoute, redirect, useLoaderData, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../../components/form/primitives/Button"
import { useAuthClient } from "../../../hooks/auth-client"
import { clearStashedDeviceCode, getStashedDeviceCode } from "../../../lib/device-code"
import { seo } from "../../../lib/seo"
import { m } from "../../../paraglide/messages.js"

export const Route = createFileRoute("/_public/device/approve")({
  loader: async () => {
    const userCode = await getStashedDeviceCode()
    if (!userCode) {
      throw redirect({ to: "/device" })
    }
    return userCode
  },
  component: DeviceApprovePage,
  head: () => ({ meta: seo({ title: m.seo_device_approve_title() }) })
})

function DeviceApprovePage() {
  const userCode = useLoaderData({ from: "/_public/device/approve" })
  const authClient = useAuthClient()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimed, setClaimed] = useState(false)

  // Associate this device code with the current session before allowing approve/deny
  useEffect(() => {
    let cancelled = false
    authClient.device({ query: { user_code: userCode } }).then(({ data, error }) => {
      if (cancelled) {
        return
      }
      if (error || data?.status !== "pending") {
        setClaimError(error?.statusText ?? m.device_invalid_or_expired_code())
        return
      }
      setClaimed(true)
    })
    return () => {
      cancelled = true
    }
  }, [userCode])

  if (claimError) {
    return (
      <>
        <h1 className="text-neon-hi/80">{m.device_invalid_code_title()}</h1>
        <p>
          {claimError}
          <br />
          {m.device_invalid_code_desc()}
        </p>
        <Button onClick={() => navigate({ to: "/dashboard" })} variant="primary" size="md">
          {m.device_go_dashboard()}
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
        toast.error(error.statusText ?? m.device_approve_error())
        return
      }
      await clearStashedDeviceCode()
      await navigate({ to: "/device/done", search: { result: "approved" } })
    } finally {
      setLoading(false)
    }
  }

  async function deny() {
    setLoading(true)
    try {
      const { error } = await authClient.device.deny({ userCode })
      if (error) {
        toast.error(error.statusText ?? m.device_deny_error())
        return
      }
      await clearStashedDeviceCode()
      await navigate({ to: "/device/done", search: { result: "denied" } })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1>{m.device_approve_title()}</h1>
      <p>{m.device_approve_description()}</p>
      <p>
        {m.device_approve_code_label()}{" "}
        <span className="text-2xl text-fg tracking-widest font-semibold">{formatDeviceUserCode(userCode)}</span>
      </p>
      <div className="flex gap-2 flex-wrap">
        <Button type="button" loading={loading} onClick={approve} autoFocus>
          {m.device_approve_approve()}
        </Button>
        <Button type="button" variant="oval" disabled={loading} onClick={deny}>
          {m.device_approve_deny()}
        </Button>
      </div>
    </>
  )
}
