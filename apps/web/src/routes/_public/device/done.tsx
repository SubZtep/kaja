import { createFileRoute, useSearch } from "@tanstack/react-router"
import { z } from "zod"
import { seo } from "../../../lib/seo"
import { m } from "../../../paraglide/messages.js"

export const Route = createFileRoute("/_public/device/done")({
  validateSearch: z.object({
    result: z.enum(["approved", "denied"]).catch("approved")
  }),
  component: DeviceDonePage,
  head: () => ({ meta: seo({ title: m.seo_device_done_title() }) })
})

function DeviceDonePage() {
  const { result } = useSearch({ from: "/_public/device/done" })
  const approved = result === "approved"

  return (
    <>
      <h1>{approved ? m.device_done_approved_title() : m.device_done_denied_title()}</h1>
      <p>{approved ? m.device_done_approved_desc() : m.device_done_denied_desc()}</p>
    </>
  )
}
