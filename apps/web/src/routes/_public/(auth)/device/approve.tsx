import { createFileRoute, useLoaderData, useNavigate, useSearch } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "#/components/form/primitives/Button"
import { MainMessageDialog } from "#/components/ui/MainMessageDialog"
import { useAuthClient } from "#/hooks/auth-client"

export const Route = createFileRoute("/_public/(auth)/device/approve")({
  validateSearch: z.object({
    user_code: z.string().optional()
  }),
  component: DeviceApprovePage
})

function DeviceApprovePage() {
  const params = useSearch({ from: "/_public/(auth)/device/approve" })
  const { session } = useLoaderData({ from: "__root__" })
  const authClient = useAuthClient()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!session?.user && params.user_code) {
      navigate({
        to: "/signin",
        search: {
          redirect: `/device/approve?user_code=${encodeURIComponent(params.user_code)}`
        }
      })
    }
  }, [session?.user, params.user_code])

  if (!session?.user) {
    return null
  }

  if (!params.user_code || params.user_code.length < 4) {
    return (
      <MainMessageDialog>
        <h1 className="text-orange-600/80">{params.user_code ? "Invalid" : "Missing"} user code</h1>
        <p>
          Please check the code or the link, and try again.
          <br />
          So close to connect.
        </p>
        <Button onClick={() => navigate({ to: "/nodes" })} variant="primary" size="md">
          View Your Placeholder
        </Button>
      </MainMessageDialog>
    )
  }

  // TypeScript now knows user_code is a non-empty string here
  const user_code: string = params.user_code

  async function approve() {
    setLoading(true)
    try {
      const { error } = await authClient.device.approve({ userCode: user_code })
      if (error) {
        toast.error(error.statusText ?? "Failed to approve")
        return
      }
      toast.success("Device approved — you can return to the CLI.")
      await navigate({ to: "/nodes" })
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
    <MainMessageDialog>
      <h1>Approve a new Node</h1>
      <p>A piece of device asked to be accessable by your account.</p>
      <p>
        Code: <div className="text-2xl text-foreground tracking-widest font-semibold">{user_code}</div>
      </p>
      <div className="flex gap-2 flex-wrap">
        <Button type="button" loading={loading} onClick={approve} autoFocus>
          Approve
        </Button>
        <Button type="button" variant="oval" disabled={loading} onClick={deny}>
          Deny
        </Button>
      </div>
    </MainMessageDialog>
  )
}
