import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "#/components/form/primitives/Button"
import { Main } from "#/components/ui/Main"
import { Section } from "#/components/ui/Section"
import { useAuthClient } from "#/hooks/auth-client"

const deviceCodeSearchSchema = z.object({
  user_code: z.string().optional()
})

function formatUserCode(raw?: string) {
  return raw?.trim()?.replaceAll("-", "")?.toUpperCase() ?? ""
}

export const Route = createFileRoute("/_public/(auth)/device/")({
  validateSearch: deviceCodeSearchSchema,
  // beforeLoad: async ({ search }) => {
  //   const formatted = formatUserCode(search.user_code)
  //   if (formatted.length < 4) return
  //   const res = await fetch(`${process.env.API_URL}/auth/device?user_code=${encodeURIComponent(formatted)}`, {
  //     headers: { "Cache-Control": "no-store" }
  //   })
  //   if (!res.ok) return
  //   const body: { status?: string } = await res.json()
  //   if (body.status !== "pending") return
  //   throw redirect({
  //     to: "/device/approve",
  //     search: { user_code: formatted }
  //   })
  // },
  component: DeviceCodePage
})

function DeviceCodePage() {
  const authClient = useAuthClient()
  const navigate = useNavigate()
  const { user_code } = Route.useSearch()
  const [userCode, setUserCode] = useState(formatUserCode(user_code))
  const [loading, setLoading] = useState(false)

  async function login(code: string) {
    const formatted = formatUserCode(code)
    if (formatted.length < 4) {
      toast.error("Enter the code from your terminal")
      return
    }
    setLoading(true)
    try {
      const { data, error } = await authClient.device({
        query: { user_code: formatted }
      })
      if (error) {
        toast.error(error.statusText ?? "Invalid or expired code")
        return
      }
      if (data) {
        await navigate({
          to: "/device/approve",
          search: { user_code: formatted }
        })
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const formatted = formatUserCode(user_code)
    if (formatted.length >= 4) {
      login(formatted)
    }
  }, [])

  return (
    <Main>
      <Section className="max-w-lg">
        <h1 className="mb-4">Connect a device</h1>
        <p className="text-muted-foreground mb-4">Enter the code shown in your terminal.</p>
        <form
          onSubmit={async ev => {
            ev.preventDefault()
            await login(userCode)
          }}
          className="flex flex-col gap-2"
        >
          <input
            className="border border-input rounded-md px-3 py-2 bg-background"
            value={userCode}
            onChange={ev => setUserCode(ev.target.value)}
            placeholder="e.g. ABCD-1234"
            maxLength={16}
            autoComplete="one-time-code"
          />
          <Button type="submit" loading={loading}>
            Continue
          </Button>
        </form>
      </Section>
    </Main>
  )
}
